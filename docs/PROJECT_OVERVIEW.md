# BSG Calculator — Огляд проєкту (архітектура та основна логіка)

> **Стан CRM (2026-09-14):** єдина CRM — **monday.com**; продакшн працює з
> `CRM_PROVIDER=monday` з 2026-08-28. HubSpot виведено з експлуатації: акаунта
> більше не існує, повернення на HubSpot немає. Код HubSpot лишається в
> репозиторії, але неактивний, а ідентифікатори з «hubspot» — легасі-назви
> (розділ 11). Докладно: [CRM_INTEGRATION.md](CRM_INTEGRATION.md) (операційний
> посібник) і [CRM_MIGRATION_RECORD.md](CRM_MIGRATION_RECORD.md) (запис міграції).

## 1. Що це за система

BSG Calculator — це внутрішній повностековий інструмент компанії **BSG** для роботи з
угодами платіжного процесингу. Він виконує дві головні задачі:

1. **Калькулятор ціноутворення** — детермінований, зона-за-зоною (Zone 0 → Zone 6)
   рушій розрахунку прибутковості угоди: обсяги трафіку, ціни для мерчанта,
   комісії партнерів/інтродюсерів, додаткові збори й ліміти, підсумкова маржа.
   Математика **заморожена** (див. розділ 5).

2. **Генератор документів (Wizard + PDF)** — майстер, який перетворює дані
   калькулятора (або ручний бланк) у **комерційну пропозицію (Offer)** та
   довгоформатну **угоду (Agreement / MSA)**. PDF рендериться на сервері,
   документи зберігаються, отримують номер формату `BSG-…` і публікуються в
   CRM (**monday.com**) як нотатки (monday «updates») на картці угоди або компанії.

Навколо цих двох ядер побудований захищений «бекофіс»: користувачі й ролі,
опційна двофакторна автентифікація, збережені калькулятори й документи (з
м'яким видаленням і журналом історії), а також синхронізація компаній та угод
із CRM **monday.com** (до 2026-08-28 — HubSpot, нині виведений з експлуатації).

Ключова архітектурна риса: **один процес Express** у продакшені обслуговує і
API, і зібраний фронтенд (SPA). У режимі розробки це два окремі процеси.

---

## 2. Стек технологій

**Фронтенд (SPA):**
- React **19** + React DOM, `react-router-dom` **7** (маршрутизація)
- Vite **6** (dev-сервер і збірка)
- `@tanstack/react-query` **5** (серверний стан: кеш, інвалідація)
- `axios` **1** (єдиний HTTP-клієнт)
- `react-hook-form` **7** + `@hookform/resolvers` (форми)
- Tailwind CSS **3** (стилі)

**Бекенд (API):**
- Express **4** + `helmet` (безпека заголовків) + `express-rate-limit` **7**
- Drizzle ORM **0.45** + `pg` (PostgreSQL)
- `jsonwebtoken` **9** (JWT), `bcrypt` **5** (хеш паролів), `otplib` **12** +
  `qrcode` (TOTP 2FA)
- `puppeteer` **24** (рендер PDF через headless Chromium)
- `pino` + `pino-http` (структуровані логи)
- `zod` **3** (валідація вводу й контракт env)
- `tsx` **4** — **у залежностях (не dev)**, бо продакшн запускає TypeScript
  напряму через `tsx`, без окремого кроку компіляції сервера

**Інструменти:** TypeScript **5.8**, Vitest **4** (+ Testing Library, jsdom),
`supertest` (інтеграційні тести бекенду), ESLint **9**, `pixelmatch` + `pngjs`
(візуальна регресія PDF).

**Важлива деталь про запуск:** фронтенд збирається у статичні файли (Vite →
`dist/`), а сервер у продакшені **не компілюється в JS** — його TypeScript
виконує `tsx` прямо. Тому `tsx` є повноцінною runtime-залежністю.

---

## 3. Архітектура в цілому

```
   Браузер (React 19 SPA, Vite)
      │  fetch → /api/v1/*
      │  (єдиний axios; access-token у пам'яті, refresh — httpOnly cookie)
      ▼
   Express API (server/)                    ┌───────────────────────────┐
      • middleware: helmet+CSP, rate-limit, │ Пул Puppeteer (1 Chromium │
        cookie/JSON parsers, request-id,    │ на процес) — рендер PDF    │
        логер                               └───────────────────────────┘
      • /api/v1/* — вертикальні зрізи модулів
      • у проді роздає зібраний SPA (/srv/spa)
      ▼                          ▲
   PostgreSQL (Drizzle ORM)      │  кешовані читання (TTL), запис нотаток,
                                 │  вхідні webhooks (секрет у шляху)
                                 ▼
                              monday.com (CRM)
```

**Ключові принципи:**
- **Джерело істини для контрактів даних** — Zod-схеми на бекенді; фронтенд-типи
  (у `src/api/types.ts`) дзеркалять їх вручну.
- **Калькуляторна математика — чиста** (без React), тож той самий код
  використовується і в браузері, і при рендері PDF на сервері.
- **Вертикальні зрізи** на бекенді: кожна фіча — самодостатня папка
  `routes → controller → service → repository → schemas`.

**Dev проти prod:**
- *Dev:* SPA (Vite, `http://localhost:5173`) і API (Express, `:8080`) — **два
  процеси**. SPA звертається до API крос-орієнтно, CORS дозволяє
  `FRONTEND_ORIGIN`.
- *Prod:* **один контейнер**. Express віддає і зібраний SPA (`/srv/spa`), і API.
  Перед ним — Traefik (термінує TLS, маршрутизує за доменом).

---

## 4. Структура репозиторію

```
src/                          React SPA
  api/                        axios-клієнт + типізовані обгортки ендпоінтів + типи
  components/
    calculator/               UI калькулятора: зони, стан, derived-дані
    document-wizard/          майстер + білдери HTML для Offer/Agreement + pdf-kit
    (спільні)                 AppShell, PrivateRoute, RequireRole, модалки, бейджі
  config/                     idleTimeout тощо
  contexts/                   AuthContext, CalculatorContext, ToastContext
  domain/calculator/          ЗАМОРОЖЕНА чиста математика (zone0..zone6, shared)
  hooks/                      хуки TanStack Query + утиліти (useIdleTimeout, ...)
  pages/                      сторінки за маршрутами (+ pages/admin/)
  shared/                     крос-катінг: roles, format, html, constants
  App.tsx                     маршрутизатор; main.tsx — провайдери

server/                       Express API
  app.ts                      фабрика Express: стек middleware + монтування роутів
  index.ts                    вхід процесу: bind PORT, bootstrap, graceful shutdown
  config/env.ts               Zod-валідований контракт змінних оточення
  config/constants.ts         константи (напр. вікно грейсу для refresh)
  db/schema/*.ts              таблиці Drizzle (+ barrel index.ts)
  db/migrations/              SQL-міграції 0000..0023 (+ meta/)
  db/migrate.ts               застосування міграцій (advisory-lock)
  middleware/                 auth, roles, rate-limit, request-id, error-handler,
                              logger, verify-hubspot-signature
  modules/<feature>/          вертикальні зрізи (auth, users, companies, deals,
                              documents, calculator-configs, pdf, monday,
                              crm-notes, hubspot [неактивний], ...)
  shared/                     async-handler, errors, roles, token/totp-utils,
                              hubspot/note-builder (тіло нотатки для будь-якої CRM)
  scripts/                    bootstrap-super-admin, create-user, monday-backfill,
                              monday-drift-check, monday-remap (одноразовий);
                              hubspot-backfill, reconcile-companies (HubSpot-ера)
  tests/                      інтеграційні тести (supertest) + fixtures, setup.ts

docs/                         документація (цей файл — самодостатній огляд)
scripts/                      dev/ops-скрипти (monday inspect/match, hubspot-* [HubSpot-ера], visual-diff)
Dockerfile, docker-compose*.yml, docker/entrypoint.sh, nginx/  пакування й деплой
tsconfig.json                 конфіг SPA
tsconfig.server.json          конфіг бекенду (+ підмножина src для чистих білдерів)
vite.config.ts                Vite + конфіг vitest (фронтенд)
vitest.server.config.ts       vitest бекенду (node env, реальний Postgres)
drizzle.config.ts             конфіг Drizzle Kit
```

---

## 5. Калькулятор — основна логіка

Це серце продукту. Увесь код у `src/domain/calculator/` — **чистий TypeScript без
імпортів React**, тому його можна підключати і в браузер, і в серверну збірку.

### 5.1. Головне правило: калькулятор заморожений

**Математику й бізнес-логіку калькулятора не можна змінювати без явного дозволу
замовника.** Це стосується всього `src/domain/calculator/**` і похідних хуків
розрахунку (`useCalculatorDerivedData`, `derived/*`). У коді це зафіксовано
коментарем-заголовком у файлах зон:
*«Calculator math is frozen — do not modify formulas without explicit product
approval.»*

Чисті рефактори дозволені лише якщо `npm run verify` лишається зеленим і
результати ідентичні до символа. Кожна зона має поруч свій `.test.ts`, який
фіксує очікувані числа.

### 5.2. Зони 0–6 (що робить кожна)

Розрахунок побудований як конвеєр зон. На вході — сирі параметри угоди, на
виході — дерево прибутковості й текстовий підсумок пропозиції.

- **Zone 0 — тип калькулятора** (`zone0/calculatorType.ts`). Перемикач режимів
  *payin* / *payout*. Гарантує, що завжди увімкнено щонайменше один режим
  (`applyCalculatorModeToggle`). Далі майже вся логіка розгалужується на дві
  паралельні гілки — payin і payout.

- **Zone 1 — трафік** (`zone1/traffic.ts`). Виводить обсяги з сирих вхідних
  (місячний обсяг, кількість транзакцій, % апруву, частка EU, частка карткових
  CC vs альтернативних методів APM). Розкладає все на розрізи
  регіон×метод (EU-CC / EU-APM / WW-CC / WW-APM), рахує середній чек і
  кількість успішних транзакцій. Виходи — `PayinTrafficDerived` /
  `PayoutTrafficDerived`.

- **Zone 2 — комісія інтродюсера/партнера** (`zone2/introducerCommission.ts`).
  Три режими: `standard` (фіксовані тарифи «за мільйон обороту» по тірах),
  `custom` (три налаштовувані діапазони), `revShare` (партнер отримує частку
  маржі після витрат). Ця комісія зменшує підсумкову маржу BSG у Zone 5.

- **Zone 3 — конфіг ціноутворення для мерчанта** (`zone3/pricingConfiguration.ts`).
  Ціни, які бачить клієнт: модель `icpp` або `blended`; ставки — `single` або
  `tiered`; MDR% та фікс за транзакцію (окремо CC/APM), scheme fees, interchange.
  Містить окремий механізм «Dedicated Countries» для EU-Blended (частка обороту
  UK+CH тарифікується за окремим коефіцієнтом). Ставки задаються окремо для
  payin (по регіонах) і payout.

- **Zone 4 — інші збори й ліміти** (`zone4/otherFeesAndLimits.ts`). Допоміжні
  збори та умови контракту: період сеттлменту (`T+1`…`T+5`), мінімальна комісія
  за виплату (загальна або по регіонах EU/WW), 3DS-збір, settlement fee %,
  місячний мінімум, тарифікація невдалих транзакцій, а також
  `ContractSummarySettings` (setup/refund/dispute costs, ліміти збору й виплат,
  rolling reserve: % / днів утримання / стеля).

- **Zone 5 — рушій прибутковості** (`zone5/`, barrel `profitability.ts`). Ядро
  розрахунку. Тут задані **вартості провайдера** (`constants.ts`: тіри MDR
  для payin/payout, фікс за транзакцію CC/APM тощо). Модулі: `payin.ts`,
  `payout.ts`, `other.ts` (дохід від 3DS/сеттлменту/місячного мінімуму), а
  `total.ts` (`calculateTotalProfitability`) підсумовує чисту маржу
  payin+payout+other, застосовує комісію інтродюсера (включно з revShare) і
  видає попередження про від'ємну маржу.

- **Zone 6 — підсумок пропозиції** (`zone6/offerSummary.ts`). Збирає
  людиночитабельний текстовий підсумок з усіх зон
  (`OfferSummaryInput` тягне derived-трафік і всі конфіги цін та зборів).

**Спільні хелпери** (`shared/`): `math.ts` (`normalizePercent`,
`roundUpToStep`, `splitByPercent`, `toInteger`, крок округлення обсягу) і
`format.ts` (форматування сум).

### 5.3. Як будуються похідні (derived) дані

Домен — чиста математика; «клей» між ним і UI живе у
`src/components/calculator/derived/`:

- `buildUnifiedProfitabilityTree.ts` збирає `buildPayinSubtree.ts` +
  `buildPayoutSubtree.ts` в єдине дерево `UnifiedProfitabilityNode` — це
  розгортаний UI-розклад прибутковості.
- Хуки: `usePricingPreviews.ts` (мемоїзовані прев'ю цін),
  `useFeeImpacts.ts` (впливи 3DS/сеттлменту/місячного мінімуму/невдалих
  транзакцій), `useUnifiedTreeExpansion.ts` (стан розгортання дерева).
- Оркестратор `useCalculatorDerivedData.ts` викликає всі функції домену над
  «живим» станом і повертає все, що потрібно UI та контексту.

### 5.4. Важливо: стан калькулятора не персиститься автоматично

Стан калькулятора — **клієнтський, у межах сесії, у пам'яті**. Він піднятий у
`CalculatorContext`, щоб сторінки калькулятора й майстра ділили одне джерело
істини. Зберігається він лише явно — як `calculator_configs` (див. розділ 6 і 8),
у вигляді JSON-снапшота (`snapshotShape.ts` описує межу того, що серіалізується:
`extractCalculatorSnapshot` / `seedCalculatorStateFromSnapshot`).

---

## 6. Фронтенд

### 6.1. Маршрутизація (`src/App.tsx`)

`BrowserRouter` → публічні маршрути `/login`, `/accept-invite`,
`/reset-password`; далі гейт `PrivateRoute`, що обгортає `CalculatorProvider` +
`AppShell`. Усередині:

- `/` → редірект на `/companies`
- `/companies`, `/companies/:id` — компанії та деталі
- `/documents`, `/documents/:number` — документи та перегляд
- `/calculator` (новий чернетковий), `/calculators` (список),
  `/calc/:id` (редагування збереженого конфігу)
- `/wizard` — майстер документів
- `/me` — особистий кабінет
- вкладений гейт `RequireRole min="super_admin"` → `/admin/users`,
  `/admin/audit-log`
- `*` → сторінка 404

`RequireRole` не редіректить, а показує сторінку 403.

### 6.2. Сторінки (`src/pages/`)

`LoginPage`, `AcceptInvitePage`, `ResetPasswordPage`, `CompaniesPage`,
`CompanyDetailPage`, `DocumentsListPage`, `DocumentViewPage`, `CalculatorPage`,
`CalculatorsListPage`, `WizardPage`, `PersonalCabinetPage`, `AdminUsersPage`,
`AuditLogPage`, `NotFoundPage`. У `pages/admin/` — спільні частини для
керування користувачами та панель інвайтів. Більшість сторінок мають поруч
`.test.tsx`.

### 6.3. Керування станом

- **Серверний стан — TanStack Query.** Хуки в `src/hooks/`: `useCompanies`,
  `useCompany`, `useCompanySearch`, `useDocuments`, `useCalculatorConfig`, плюс
  утиліти (`useDebouncedValue`, `useSortState`, `useIdleTimeout`). Глобальні
  налаштування (`staleTime`, `gcTime`, `retry: 1`,
  `refetchOnWindowFocus: false`) задані в `main.tsx`.
- **Стан калькулятора — клієнтський, у `CalculatorContext`** (див. 5.4).
- **`AuthContext`** відповідає за «чи я залогінений»: при холодному старті
  пробує refresh за cookie → `/auth/me`, дає `hasRole` через `shared/roles.ts`.
- **`ToastContext`** — сповіщення.
- Порядок провайдерів у `main.tsx`: QueryClient → Toast → Auth → App.

### 6.4. API-шар (`src/api/`)

`client.ts` — **єдиний екземпляр axios** і найважливіший файл шару:

- Access-token зберігається **лише в пам'яті** (`setAccessToken` /
  `getAccessToken`), ніколи в localStorage; інжектиться як `Bearer` у
  request-інтерсепторі.
- Response-інтерсептор робить **single-flight refresh-on-401** (`refreshOnce`):
  при 401 один запит на `/auth/refresh`, після чого оригінальний запит
  переграється. Відрізняє **справжню втрату сесії** (401/403 від самого
  `/auth/refresh` → `onSessionLost()` → редірект на `/login`) від
  **транзієнтної помилки** (5xx / 429 / мережа — сон ноутбука, блимання Wi-Fi,
  редеплой → сесія зберігається, ретрай на наступному запиті).
- Помилки бекенду мапляться в типізований `ApiError {code, status, details}`.
- `baseURL = VITE_API_BASE_URL ?? "/api/v1"`, `withCredentials: true`.

Обгортки по ресурсах: `auth.ts`, `companies.ts`, `deals.ts`, `documents.ts`,
`calculator-configs.ts`, `hubspot.ts` (легасі; SPA його не викликає),
`users.ts`, `invites.ts`, `password-resets.ts`, `admin-actions.ts`, `pdf.ts`. Типи (`Public*` DTO,
конверти) — у `types.ts`; barrel `index.ts` дає простори імен виду
`api.companies.*`.

---

## 7. Бекенд

### 7.1. Порядок middleware (`server/app.ts`)

Порядок — навантажений (задокументований прямо у файлі):

1. `trust proxy` = `TRUST_PROXY_HOPS` (за замовч. 1 — Traefik), щоб ключі
   rate-limit не підмінялись через `X-Forwarded-For`
2. `helmet` з явним **CSP** (див. розділ 9)
3. **Raw-body парсер** рівно на шляху `/api/v1/hubspot/webhooks`
   (`express.raw`) — має бути **до** JSON-парсера, інакше HMAC не порахувати.
   Ніколи не розширюйте його область — це «зламає» JSON для всіх POST.
   Це легасі-приймач HubSpot (неактивний); вебхук monday
   (`/api/v1/monday/webhooks/:secret`) raw-body не потребує і йде через
   звичайний JSON-парсер.
4. `express.json({limit:"1mb"})`
5. `cookieParser()`
6. `cors` (у dev — `FRONTEND_ORIGIN`, у prod — вимкнено, бо один origin)
7. `requestId()` (X-Request-Id)
8. `requestLogger()` (pino-http)
9. `healthRouter` у корені (`/health`, без rate-limit і без префікса `/api/v1`)
10. `apiLimiter` на `/api/v1` (60/хв на IP)
11. монтування роутів модулів
12. статика SPA (`/srv/spa`, кеш 1 рік immutable) + history-fallback
    (`app.get("*")` віддає `index.html` для будь-якого не-`/api/` шляху)
13. `notFoundHandler`, потім `errorHandler` (останнім)

### 7.2. Вертикальний зріз (форма кожної фічі)

```
routes.ts       → ендпоінти + per-route middleware (auth, role, rate-limit)
controller.ts   → парсинг/валідація вводу (Zod), виклик сервісу, форма відповіді
service.ts      → бізнес-логіка + транзакції (єдиний шар, що «вирішує»)
repository.ts   → доступ до БД (запити Drizzle) — без бізнес-логіки
schemas.ts      → Zod-схеми запиту/відповіді (контракт)
```

**Інваріанти:**
- **Конверт помилки:** кожна помилка — `{ error: { code, message, details? } }`
  з документованим `code`. Кидайте типізовані помилки з `server/shared/errors.ts`;
  центральний `error-handler` перетворює їх на конверт. Жодних несподіваних 500.
- **Валідуйте увесь ввід** у контролері через Zod ще до сервісу.

### 7.3. Модулі (`server/modules/<feature>/`)

- **auth** — login / refresh (ротація + грейс 10с) / logout / `/me` /
  зміна власного пароля / «вийти скрізь»; плюс `two-factor.*` (TOTP:
  setup/confirm/verify/disable/regenerate/status) і робота з cookie/token.
- **users** — CRUD користувачів (super_admin), скидання пароля, примусове
  вимкнення 2FA; монтує адмінський роутер інвайтів.
- **invites** — інвайт-лінки: створення/список/відкликання (admin) + публічні
  preview/accept.
- **password-resets** — лінки скидання пароля: публічні preview/consume
  (видаються адміном).
- **companies** — список/деталі/угоди компанії (будь-який авторизований) +
  `DELETE /:id` локальна чистка (admin); `companies.merge.service.ts` —
  злиття компаній HubSpot-ери (у monday-режимі не викликається).
- **deals** — список/деталі (тільки читання, синхронізовано з CRM).
- **calculator-configs** — CRUD збережених снапшотів калькулятора; м'яке
  видалення + відновлення (super_admin), ручна синхронізація з CRM,
  `/:id/events`.
- **documents** — заморожені артефакти offer/agreement: список / за номером /
  створення (admin), «використати як шаблон», синхронізація з CRM, м'яке
  видалення (admin) + відновлення (super_admin), `/:number/events`; плюс
  `numbering.service.ts` (нумерація) і `sync.service.ts`.
- **pdf** — рендер через Puppeteer: `browser-pool.ts` (один Chromium на процес)
  і `pdf.service.ts` (`renderHtmlToPdf`), два роутери
  (`/:number/pdf`, `/pdf/preview`).
- **monday** — активна CRM (розділ 11): `monday.client.ts` (GraphQL-клієнт,
  закріплена версія API), `monday.columns.ts` / `monday.column-cache.ts`
  (резолв колонок), `monday.mapper.ts`, `monday.backfill.ts` (upsert компаній
  та угод), `monday.refresh.ts` (TTL-оновлення одного рядка),
  `monday.maintenance.ts` (плановий бекфіл + heartbeat черги) і `webhooks/`
  (приймач + процесор черги).
- **crm-notes** — публікація нотатки в активну CRM (`publishCrmNote`) і
  зняття нотаток за реєстром `crm_notes`.
- **hubspot** — *неактивний код HubSpot-ери*: `hubspot.client.ts` (читання CRM
  v3), `hubspot.mapper.ts`, `hubspot.service.ts` (кешовані пайплайни) і
  `webhooks/` (приймач + процесор; процесор і стартовий бекфіл запускаються
  лише при `CRM_PROVIDER=hubspot`; маршрути `/api/v1/hubspot/webhooks`,
  `/refresh`, `/pipelines` лишаються змонтованими, але SPA їх не викликає).
- **events** — хелпери журналу подій (document_events / calculator_config_events);
  без окремого роутера — монтуються на роути документів/конфігів.
- **admin-actions** — перегляд аудит-логу (super_admin).
- **health** — `/health` у корені.

Змонтовані шляхи: `/api/v1/auth`, `.../auth/invite`, `.../auth/password-reset`,
`/api/v1/users`, `/companies`, `/deals`, `/hubspot` (легасі), `/monday` (вебхуки),
`/calculator-configs`,
`/documents` (+ `pdfRouter` для `/:number/pdf`), `/pdf` (preview),
`/numbering`, `/admin`.

---

## 8. База даних

**PostgreSQL** через **Drizzle ORM**. Таблиці — у `server/db/schema/*.ts`
(barrel `index.ts`). Міграції — 24 SQL-файли `0000_…`–`0023_…` (+ `meta/`),
переглядувані та комітяться. `push` заборонено (`strict: true`) — тільки
згенеровані міграції.

**Робочий цикл зміни схеми:** відредагувати `schema/*.ts` → `npm run db:generate`
(запише нову міграцію) → переглянути SQL → `npm run db:migrate`. Перевагу —
адитивним змінам; на великих таблицях звертайте увагу на ризик блокувань.

**18 таблиць** (плюс службова `crm_id_map` — журнал зіставлень одноразового
ремапу, створена SQL-міграцією 0021 поза Drizzle-схемою):

1. **users** — ідентичності: `email`/`login` (citext, унікальні),
   `password_hash` (bcrypt), `display_name`, `is_active`, `role`
   (user/admin/super_admin), поля TOTP (`totp_secret_encrypted`,
   `totp_enabled_at`).
2. **refresh_tokens** — ротаційні opaque refresh-токени (sha256 `token_hash`,
   `expires_at`, `revoked_at`, `last_used_at`); FK на користувача CASCADE.
3. **companies** — синхронізовані з CRM (monday.com): `hubspot_company_id`
   (натуральний ключ, унікальний; назва легасі — компанії, створені з monday,
   мають синтетичний ключ `mon:<itemId>`), `name`, `company_type`,
   `lifecycle_stage`; прив'язка до картки monday — `crm_item_id`, `crm_board_id`,
   `crm_binding_role` (`primary`|`alias`), `monday_raw`; маркери
   `crm_deleted_at` / `crm_deleted_reason` / `crm_missing_since`;
   `hubspot_modified_at` (в UI «CRM updated» — `updated_at` картки monday) і
   `last_synced_at`. Колонки HubSpot-ери (`hubspot_raw`, `hubspot_deleted_at`)
   лишились, але більше не оновлюються.
4. **deals** — синхронізовані з CRM (monday.com): `hubspot_deal_id` (для угод
   із monday — `mon:<itemId>`), FK на компанію `hubspot_company_id`, `name`,
   `stage`, `pipeline_id`, `amount`, `currency`, вертикаль бізнесу; прив'язка —
   `crm_item_id`, `crm_board_id`, `crm_company_item_id` (посилання «Company (M)»),
   `monday_raw`; `hubspot_modified_at`, `last_synced_at`; `hubspot_raw` —
   HubSpot-ера.
5. **calculator_configs** — збережені снапшоти калькулятора: FK на компанію,
   опційний `hubspot_deal_id`, `title`, `payload` (JSONB), автор, стан
   синхронізації з CRM (`hubspot_sync_state`, `hubspot_note_id` — легасі-назви;
   `crm_note_provider` — у якій CRM лежить нотатка, hubspot/monday), поля
   м'якого видалення.
6. **documents** — заморожені артефакти offer/agreement: `number` (унікальний
   BSG), FK на компанію (RESTRICT), опційні `hubspot_deal_id` /
   `calculator_config_id`, `scope` (offer/agreement/offer_and_agreement),
   `payload` (JSONB), стан синхронізації з CRM + `hubspot_note_id` /
   `crm_note_provider`, автор, метадані м'якого видалення.
7. **document_number_sequence** — синглтон-рядок із `next_value` для атомарної
   видачі BSG-номерів.
8. **hubspot_webhook_events** — *HubSpot-ера, лише історія*: журнал вхідних
   вебхуків HubSpot: `hubspot_event_id`
   (унікальний ключ ідемпотентності), тип, об'єкт, час, `status`
   (pending/processed/failed), `attempts`, `last_error`, `raw`.
9. **document_events** — аудит по документу: тип події
   (created / pdf_downloaded / synced_to_hubspot / sync_failed / deleted /
   restored / deletion_reason_edited; `synced_to_hubspot` — легасі-назва
   синхронізації з активною CRM), актор, `meta`.
10. **calculator_config_events** — те саме для конфігів калькулятора.
11. **admin_actions** — append-only лог привілейованих дій: денормалізовані
    ім'я/емейл актора, `action_type`, ціль, `meta`.
12. **user_invites** — інвайт-лінки: `role`, sha256 `token_hash`, `expires_at`,
    поля прийняття, `revoked_at`.
13. **password_resets** — лінки скидання пароля (sha256 `token_hash`,
    одноразові).
14. **totp_backup_codes** — одноразові резервні коди 2FA (sha256).
15. **trusted_devices** — «довіряти цьому браузеру 30 днів» (sha256 токен +
    `fingerprint_hash`).
16. **mfa_temp_tokens** — короткоживучі (5 хв) одноразові токени кроку 2FA
    при вході.
17. **monday_webhook_events** — черга вхідних вебхуків monday: синтетичний
    `event_key` (md5 від дошки, картки, типу й часу події — monday не надсилає
    унікального id), `event_type`, `board_id`, `item_id`, `object_type`
    (company/agent/deal), `status` (pending/processed/failed), `outcome`,
    `attempts`, `last_error`, `raw` (лише для дебагу — дані перечитуються з API).
18. **crm_notes** — реєстр усіх нотаток, створених у CRM: власник (документ
    або конфіг), `provider` (hubspot/monday), `note_id`, ціль
    (company/agent/deal) та її id, `torn_down_at`, `last_error`.

---

## 9. Автентифікація та модель безпеки

**Access-токен:** короткоживучий JWT (за замовч. 15 хв), payload `{sub, role}`,
підпис `JWT_ACCESS_SECRET`. Зберігається **лише в пам'яті** клієнта. Токен без
відомого `role` вважається невалідним (форсить refresh).

**Refresh-токен:** opaque random (32 байти), у БД зберігається **лише sha256-хеш**
(`refresh_tokens.token_hash`); сирий токен живе тільки в **httpOnly + Secure +
SameSite=Strict** cookie на шляху auth. **Ротація на кожен `/auth/refresh`**
(старий рядок відкликається, вставляється новий) з **грейс-вікном ~10с**
(`REFRESH_GRACE_WINDOW_MS`), щоб гасити гонки між вкладками. TTL за замовч.
**12h** — абсолютна межа й для рядка в БД, і для cookie.

**Idle-логаут:** 30 хв без активності (`mousemove`/`keydown`/`click`/`scroll`) →
примусовий вихід, із попереджувальним модалом ~2 хв до того
(`useIdleTimeout` + `IdleTimeoutWarning`). Хук переоцінює таймер при поверненні
фокуса на вкладку.

**2FA (TOTP), опційно:** сумісно з Google Authenticator (`otplib`). Секрет
кожного користувача зашифрований AES-256-GCM (ключ `TOTP_ENCRYPTION_KEY`).
Enrolment: setup → confirm. Вхід на акаунт із 2FA: правильний пароль дає **не
сесію**, а одноразовий `mfa_temp_tokens` (TTL 5 хв), який пред'являється на
`/auth/2fa/verify`. 10 одноразових backup-кодів. «Довіряти браузеру 30 днів»
створює `trusted_devices` (щоб пропускати TOTP). Вимкнення/регенерація
вимагають повторної автентифікації паролем + поточним кодом.

**RBAC:** ієрархія `user ⊂ admin ⊂ super_admin` (`ROLE_TIER`), дзеркалиться в
`server/shared/roles.ts` і `src/shared/roles.ts`. `requireRole(min)` пускає роль
«не нижче за». Матриця: читання — будь-який авторизований; створення/редагування/
видалення документів і конфігів — `admin`; керування користувачами, аудит-лог,
відновлення — `super_admin`.

**Rate limiting** (`express-rate-limit`, у пам'яті, вимкнено в `NODE_ENV=test`):
глобально 60/хв на IP; жорсткіше на чутливих шляхах (login 5/хв, refresh 20/хв,
2FA verify 10/хв, pdf-preview 10/хв, webhook 200/хв на приймачах вебхуків monday
і HubSpot (легасі) тощо). `hubspotProxyLimiter` (10/хв, назва легасі)
стоїть на ручній синхронізації з CRM і видаленні документів та конфігів, а також
на легасі-маршрутах `/api/v1/hubspot/refresh` і `/pipelines`.

**CSP / заголовки** (helmet): `default-src 'self'`; `script-src 'self'
https://static.cloudflareinsights.com`; `style-src 'self' 'unsafe-inline'
https://fonts.googleapis.com`; `img-src 'self' data: blob:`;
`connect-src 'self'`; `font-src 'self' data: https://fonts.gstatic.com`;
`frame-src 'none'`; `frame-ancestors 'none'`.

**Вхідні вебхуки monday:** monday не підписує вебхуки, створені з персональним
токеном, тому захист двоскладовий: (1) невгадуваний сегмент шляху
`MONDAY_WEBHOOK_SECRET` (порівняння через `crypto.timingSafeEqual`, у логах
запитів маскується); (2) payload — лише тригер: процесор перечитує картку з API
власним токеном, тож підроблений запит щонайбільше спричинить одне зайве
читання. *(HubSpot-ера: приймач HubSpot перевіряв HMAC-SHA256 v3; код лишився,
але неактивний.)*

**Інше:** паролі — bcrypt (`BCRYPT_COST`, за замовч. 12). Привілейовані дії
пишуться в `admin_actions`. У проді `env.ts` жорстко валідує конфіг: блокує
placeholder-секрети, відхиляє локальний `APP_PUBLIC_URL` (`http://localhost…` /
`http://127.…`) — задавайте реальний https-origin, а для **активної** CRM —
канонічний базовий URL API (захист від SSRF), API-токен і webhook-секрет
(розділ 14).

---

## 10. Майстер документів і PDF-пайплайн

### 10.1. Білдери HTML (`src/components/document-wizard/`)

HTML для PDF будується як **чисті рядки, без React**, тому підключається у
серверну збірку (через include-список `tsconfig.server.json`):

- **Offer:** вхід `buildOfferPdfHtml.ts` збирає секції
  (`offerPdf/sections/{payin,payout,fees,terms}.ts`) у рядки `<tr><td>` таблиці
  `table.page-layout` (секції мають `break-inside: avoid`, без примусових
  розривів сторінок). Дизайн-система — у `pdf-kit/` (`tokens.ts`, `styles.ts`,
  `primitives.ts`, компоненти сіток/заголовків).
- **Agreement (MSA):** `agreementPdf/index.ts` (`buildAgreementBodyHtml`)
  рендерить секції з `agreementPdf/sections.ts`, блоки сторін і підпису. Увесь
  ввід екранується через `src/shared/html.ts`.

Обсяг документа (`scope`): `offer` | `agreement` | `offer_and_agreement`.

### 10.2. UI майстра

`DocumentWizardPanel.tsx` + `wizard/steps/` — **7 кроків**: HeaderMeta, Parties,
Payin, Payout, OtherFees, Terms (з підсекціями RollingReserve, TransactionLimits,
PayinMinimumFee, CustomTermsBlocks, TermsLegal), Preview. Кожне поле може мати
режим `value | waived | na | tbd`. Дані (`DocumentTemplatePayload`) сідяться з
калькулятора (`fromCalculator.ts`) або з бланку/дефолтів
(`manualSeeds.ts`). `WizardPage.tsx` зв'язує все з `CalculatorContext`, даними
компанії та PDF-API.

### 10.3. Рендер на сервері (`server/modules/pdf/`)

`pdf.service.ts#renderHtmlToPdf` бере браузер із `browser-pool.ts` (один Chromium
на процес, рециклиться після `PUPPETEER_RENDERS_PER_BROWSER`=1000 рендерів або
через `PUPPETEER_BROWSER_TTL_MS`=24h; у тестовому оточенні кидає помилку, щоб не
піднімати Chromium), робить `page.setContent(html)`,
`emulateMediaType("print")`, `page.pdf(...)` з бігучим хедером (акцентна смуга)
і футером (дисклеймер конфіденційності + «CONFIDENTIAL · Page X of Y») у полях
сторінки. Жорсткий таймаут — `PDF_RENDER_TIMEOUT_MS` (30с).

Два ендпоінти (обидва вимагають auth):
- `GET /api/v1/documents/:number/pdf` — рендер збереженого документа (валідує
  номер, пише подію `pdf_downloaded`)
- `POST /api/v1/pdf/preview` — рендер «живого» стану майстра без збереження
  (rate-limit 10/хв)

### 10.4. Нумерація документів

**Формат номера — `BSG-<seq>-<companyKey>`**, де `seq` — 7-значна монотонна
послідовність, а `companyKey` — останні 6 цифр `hubspot_company_id`.
Приклад: `BSG-7100001-874808`.

Номер видається **атомарно всередині транзакції POST**: `UPDATE
document_number_sequence SET next_value = next_value + 1 … RETURNING` (блокування
рядка; при відкаті транзакції номер повертається — без «дірок»). `peekNextNumber`
дає не-просуваюче прев'ю (`BSG-<seq>-XXXXXX`, поки компанію не обрано).
Стартове значення — `DOCUMENT_NUMBER_START` (за замовч. 7100001).

---

## 11. Інтеграція з CRM (monday.com)

Єдина CRM — **monday.com** (продакшн на `CRM_PROVIDER=monday` з 2026-08-28).
Інтеграція живе повністю на боці сервера: `server/modules/monday/**` (читання,
вебхуки, самовідновлення) і `server/modules/crm-notes/**` (нотатки). Канонічні
документи: [CRM_INTEGRATION.md](CRM_INTEGRATION.md) — операційний посібник,
[CRM_MIGRATION_RECORD.md](CRM_MIGRATION_RECORD.md) — постійний запис міграції.
`monday_migration_plan.md`, `monday_migration_analysis.md` і
`monday_audit_round4.md` — історичні планувальні документи.

**Що підключено.** Дошки: Companies `5102466967`, Agents `5102466950`, Deals
`5102466996` (`MONDAY_BOARD_*`; дефолти — саме ці дошки, мають бути різними).
Версія API закріплена (`MONDAY_API_VERSION=2026-07`) і перевіряється при старті
(`assertApiVersion`), бо monday мовчки «понижує» невідому версію замість
помилки; якщо перевірка не пройшла, процесор вебхуків і планове обслуговування
не стартують. Ідентифікатори колонок — не змінні оточення: їх резолвить
`monday.columns.ts`.

**Легасі-назви з «hubspot».** Перейменування wire-контракту й словника БД
свідомо відкладене, тож:
- `hubspot_company_id` (companies) — натуральний ключ компанії;
  `deals.hubspot_company_id` — FK угода→компанія. Компанії, створені з monday,
  мають синтетичний ключ `mon:<itemId>` (угоди — так само в `hubspot_deal_id`).
- `hubspot_modified_at` — в UI «CRM updated»; містить `updated_at` картки monday.
- `last_synced_at` — просувається на кожній синхронізації; керує TTL-оновленням
  і рядком «Last synced» на сторінці компанії.
- `crm_item_id` / `crm_board_id` / `crm_binding_role` (`primary`|`alias`) —
  прив'язка рядка до картки monday; `deals.crm_company_item_id` — посилання
  «Company (M)» угоди.
- `hubspotSyncState`, `hubspotNoteId`, `HUBSPOT_UNREACHABLE`,
  `synced_to_hubspot`, `/api/v1/hubspot/*` — легасі-назви; тексти в UI кажуть
  «CRM».

**Вхідні дані.** `POST /api/v1/monday/webhooks/:secret` → черга
`monday_webhook_events` → процесор. Сегмент `:secret` = `MONDAY_WEBHOOK_SECRET`
(без налаштованого секрета маршрут відповідає 404). Приймач спершу відповідає
на challenge-рукостискання monday, далі нормалізує тип події, дедуплікує,
вставляє `pending`-рядок і одразу відповідає 200. Процесор (кожні 5 с, пачками
до 50; стартує в `server/index.ts` лише при `CRM_PROVIDER=monday`, у тестах —
no-op) перечитує картку з API — **payload лише тригер** — і апсертить
компанію, агента чи угоду тим самим кодом, що й бекфіл. Ретраї: 5 спроб (бекоф
30 с × спроба), далі `status='failed'`.

Підписано 7 подій × 3 дошки = 21 вебхук: `create_item`, `change_column_value`,
`change_name`, `item_deleted`, `item_archived`, `item_restored`,
`item_moved_to_any_group`. monday **доставляє** їх під іншими назвами
(`create_pulse`, `update_column_value`, `update_name`, `delete_pulse`,
`archive_pulse`, `restore_pulse`, `move_pulse_into_group`); `normaliseEventType`
(`webhooks/webhooks.schemas.ts`) зводить їх до наших, а невідомий тип на наших
дошках логується як WARN.

Видалення й архівація спершу підтверджуються через API. Компанія, що володіє
документами або калькуляторами, не видаляється — лише позначається
(`crm_deleted_at`, бейдж «Deleted in CRM»); архівація — завжди лише позначка
(«Archived in CRM»), бо вона оборотна; видалена компанія без жодної роботи
видаляється разом зі своїми угодами. Відсутність картки в API — лише
спостереження (`crm_missing_since`, «Not found in CRM»), ніколи не підстава для
видалення.

**Вихідні дані (нотатки).** Створення документа або перше збереження
калькулятора публікує нотатку (monday «update») на картку **угоди**, якщо рядок
прив'язаний до угоди, інакше — на картку **компанії** (`publishCrmNote`; тіло —
`shared/hubspot/note-builder.ts`: номер, компанія, автор, посилання з
`APP_PUBLIC_URL`). Публікація — fire-and-forget через `setImmediate` після
коміту, якщо `AUTO_SYNC_TO_HUBSPOT=true` (легасі-назва: прапорець керує
авто-публікацією в **активну** CRM і в проді має лишатися `true`); кнопка
«Sync to CRM» — ручний ретрай, кожна синхронізація створює нову нотатку. Кожна
нотатка фіксується в `crm_notes` разом із провайдером; видалення документа чи
конфігу знімає за цим реєстром нотатки активної CRM, а нотатки HubSpot-ери
пропускає (акаунта більше немає). Рядок без прив'язки до картки monday
синхронізувати не можна — буде помилка, а не запис в іншу CRM.

**Угода → компанія.** Угода належить компанії з її посилання «Company (M)»;
воно застосовується на **кожній** синхронізації (вебхук, бекфіл, TTL-оновлення)
із запобіжниками: приймається лише `primary`-прив'язана компанія; порожнє або
неприв'язане посилання лишає угоду на місці; угода, що вже належить будь-якому
рядку, прив'язаному до тієї ж картки (зокрема `alias`-половині пари
дублікатів), не переноситься. Нова угода, чия «Company (M)» вказує на ще не
кешовану компанію, пропускається з WARN.

**Самовідновлення.**
- *TTL-оновлення при читанні* (`monday.refresh.ts`): читання рядка, чий
  `last_synced_at` старший за `HUBSPOT_SYNC_TTL_SECONDS` (легасі-назва, за
  замовч. 300 с), у фоні перечитує цю одну картку. Неприв'язані рядки
  пропускаються; якщо картки немає в API, рядок лишається як є.
- *Плановий бекфіл* (`monday.maintenance.ts`): кожні
  `MONDAY_BACKFILL_INTERVAL_HOURS` (за замовч. 24; перший запуск через
  `MONDAY_BACKFILL_FIRST_DELAY_MINUTES`=15 хв після старту) перечитує всі три
  дошки — лікує рядки, які ніхто не відкриває. Нічого не видаляє; якщо з дошки
  зникло б понад 5% прив'язаних рядків, нічого не позначає. `0` вимикає бекфіл
  (при старті — WARN).
- *Heartbeat черги* щогодини: `[monday:health]` — ERROR, якщо є події, що
  вичерпали ретраї; WARN, якщо найстаріша `pending`-подія старша за 10 хв;
  інакше INFO.
- `GET /ready` повертає `checks.monday` (пінг API) і `mondayWebhookQueue`
  (`pending`, `failed`, `oldestPendingAgeSeconds`, `lastProcessedAgeSeconds`);
  черга лише звітується і на готовність не впливає. Пейджингу/алертів немає.

*Виправлення 2026-09-14* (коміти `a84d653`, `4aeb134`): «Company (M)» угоди,
`last_synced_at` і «CRM updated» раніше записувалися лише при вставці рядка.
Через це три угоди, імпортовані під час міграції, лишалися під
агентами-рефералами (і не показувалися в майстрі для своїх мерчантів), а
TTL-оновлення вважало кожен прив'язаний рядок застарілим.

**Операції.** `npm run monday:drift` — перевірка дошок і колонок (у monday
нічого не змінює; запускати перед структурними змінами дошок).
`npm run monday:backfill` — ідемпотентний, безпечний будь-коли (у контейнері:
`docker compose exec -T app npm run monday:backfill`). Вебхуки реєструються
GraphQL-мутацією `create_webhook` на
`<APP_PUBLIC_URL>/api/v1/monday/webhooks/<MONDAY_WEBHOOK_SECRET>`; застосунок
уже має працювати з цим секретом, бо monday надсилає challenge і не реєструє
ендпоінт, що не відповідає. Чотири вебхуки `change_specific_column_value`, які
вже були на дошках, — не наші: не видаляйте їх. `server/scripts/monday-remap.ts`
— одноразовий інструмент міграції легасі-даних; новій інсталяції він не
потрібен.

**HubSpot-ера (виведена з експлуатації).** До 2026-08-28 CRM був HubSpot
(читання CRM v3, вебхуки з HMAC v3, Notes з асоціацією до угоди/компанії,
обробка злиття компаній). Акаунта HubSpot більше не існує (підтверджено
2026-09-14), тож повернення на HubSpot немає. Код (`server/modules/hubspot/**`,
`src/api/hubspot.ts`, скрипти `hubspot:*`, `reconcile-companies.ts`) лишається
в репозиторії: фонові цикли HubSpot при `CRM_PROVIDER=monday` не запускаються,
маршрути `/api/v1/hubspot/*` змонтовані, але не використовуються. Дефолт
`CRM_PROVIDER` у `env.ts` досі `hubspot` (зміну відкладено — на ньому
тримаються тести), тому `CRM_PROVIDER=monday` задавайте явно.

---

## 12. Тестування та верифікація

```bash
npm run verify        # typecheck + lint + фронтенд-тести + build (головний гейт)
npm run test          # фронтенд unit/integration (vitest, jsdom)
npm run test:server   # бекенд integration (vitest, node) — потрібен Postgres
npm run typecheck:server
```

- **Фронтенд:** ~47 тест-файлів, ~399 кейсів (vitest + Testing Library). Тести
  зазвичай лежать поруч із компонентами/сторінками/зонами домену.
- **Бекенд:** ~39 тест-файлів, ~457 кейсів (vitest + supertest проти **реального**
  Postgres). Запуск **послідовний** (`fileParallelism: false`);
  `server/tests/setup.ts` створює й мігрує тестову БД. Тестове оточення обходить
  rate-limiter'и й не запускає цикл вебхуків. `server/tests/setup.ts` не фіксує
  `CRM_PROVIDER`, а `env.ts` читає `.env`. У `.env.example` цей рядок закоментовано;
  якщо ваш локальний `.env` задає `CRM_PROVIDER=monday`, запускайте `CRM_PROVIDER=hubspot npm run test:server` —
  частина тестів розраховує на дефолт коду (змінна оболонки має пріоритет над
  `.env`).
- **CI** (`.github/workflows/ci.yml`): один job на Node 20 —
  `typecheck → lint → test → build`. ⚠️ **CI НЕ запускає `test:server` і
  `typecheck:server`** (немає живого Postgres) — ганяйте їх локально перед
  пушем змін бекенду.

---

## 13. Деплой та експлуатація

**Один контейнер** (`Dockerfile`, мультистейдж), що хостить SPA + API + Chromium:

- *Stage `spa-build`* (`node:20-alpine`): `npm ci`, `npm run build` → `/app/dist`.
- *Stage `runtime`* (`node:20-bookworm-slim`): ставить `chromium` +
  `chromium-sandbox`, шрифти, `tini`, `curl`, `netcat`. `npm ci --omit=dev`
  (`tsx` виживає, бо він runtime-залежність). Копіює `server/`, `scripts/`,
  `src/`, tsconfig'и та зібраний SPA у `/srv/spa`. Працює як **non-root `node`**.
  `EXPOSE 8080`, `HEALTHCHECK curl /health`, `CMD tsx server/index.ts`.
  **Сервер у проді не компілюється в JS — `tsx` виконує TypeScript напряму.**

**`docker/entrypoint.sh`:** (1) чекає на Postgres через `nc -z` (до 60с);
(2) `tsx server/db/migrate.ts` (ідемпотентні міграції під advisory-lock);
(3) `exec "$@"` — щоб Node був PID 1 під `tini` (коректний SIGTERM).

**`docker-compose.yml` (prod):** `postgres:15-alpine` (не проброшений на хост,
іменований volume, healthcheck `pg_isready`) + `app` (`depends_on: postgres
healthy`, `NODE_ENV=production`, `PORT=8080`). Перед сервісом — **Traefik** (за
мітками: `Host(...)`, TLS-certresolver, один loadbalancer на порт 8080 — і для
`/api/*`, і для SPA). `docker-compose.dev.yml` піднімає лише Postgres на
`127.0.0.1:5433`.

**Роздача SPA у проді:** сам Express — `express.static("/srv/spa", {maxAge:"1y",
immutable:true})` для хешованих ассетів, потім `app.get("*")` віддає `index.html`
(no-cache) для будь-якого не-`/api/` шляху (React Router рулить клієнтськими
маршрутами).

**Старт процесу (`server/index.ts`):** bind порту, `bootstrapSuperAdmin()`; при
`CRM_PROVIDER=monday` — перевірка закріпленої версії API monday
(`assertApiVersion`), після успіху — `startMondayWebhookProcessor()` і
`startMondayMaintenance()` (плановий бекфіл + heartbeat черги); якщо перевірка
не пройшла, вони не стартують (у лог — ERROR). Бекфіл і процесор вебхуків
HubSpot запускаються лише при `CRM_PROVIDER=hubspot` (HubSpot-ера). Graceful
shutdown на SIGTERM/SIGINT: злити HTTP → зупинити поллери вебхуків → закрити
Puppeteer → злити пул БД (форс-вихід за 10с).

**Домен і публічний URL** задаються через `APP_DOMAIN` / `APP_PUBLIC_URL`
(розділ 14). Оновлення проду — див. [deployment.md](deployment.md) і §8
[CRM_INTEGRATION.md](CRM_INTEGRATION.md); **ніколи** не виконуйте
`docker compose down`.

---

## 14. Змінні оточення

`server/config/env.ts` — **авторитетний, Zod-валідований контракт**: застосунок
відмовляється стартувати на невалідній конфігурації (`process.exit(1)`).
`.env.example` / `.env.production.example` — комітнуті шаблони; реальні `.env*`
у git ігноруються. Групи:

| Група | Ключі (вибірка) |
|---|---|
| App / proxy | `NODE_ENV`, `APP_NAME`, `APP_DOMAIN`, `APP_PUBLIC_URL`, `PORT`, `TZ`, `TRUST_PROXY_HOPS` |
| Database | `DATABASE_URL` (або `DB_HOST/PORT/USER/PASSWORD/NAME`), `DB_POOL_MAX` |
| Auth / JWT | `JWT_ACCESS_SECRET` (≥32), `JWT_ACCESS_EXPIRES` (15m), `JWT_REFRESH_EXPIRES` (**12h**), `BCRYPT_COST` (12) |
| TOTP | `TOTP_ENCRYPTION_KEY` (64-hex, AES-256-GCM) |
| CORS | `FRONTEND_ORIGIN` |
| CRM (monday.com) | `CRM_PROVIDER` (**задавайте `monday` явно** — дефолт у коді `hubspot`), `MONDAY_API_TOKEN`, `MONDAY_WEBHOOK_SECRET`, `MONDAY_API_BASE_URL` (`https://api.monday.com/v2`), `MONDAY_API_VERSION` (`2026-07`), `MONDAY_BOARD_COMPANIES` / `_AGENTS` / `_DEALS` (дефолти — реальні дошки), `MONDAY_BACKFILL_INTERVAL_HOURS` (24; `0` — вимкнено), `MONDAY_BACKFILL_FIRST_DELAY_MINUTES` (15) |
| CRM — легасі-назви, діють і з monday | `HUBSPOT_SYNC_TTL_SECONDS` (300 — TTL-оновлення рядків), `AUTO_SYNC_TO_HUBSPOT` (авто-публікація нотаток в активну CRM; у проді `true`, дефолт у коді `false`) |
| HubSpot (неактивний) | `HUBSPOT_API_TOKEN`, `HUBSPOT_API_BASE_URL`, `HUBSPOT_DEAL_PIPELINE_ID`, `HUBSPOT_WEBHOOK_SECRET`, `HUBSPOT_COMPANY_TYPE_FILTER`, `HUBSPOT_BACKFILL_PAGE_SIZE`, `HUBSPOT_AUTO_BACKFILL` — при `CRM_PROVIDER=monday` не потрібні |
| PDF / Puppeteer | `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`, `PDF_RENDER_TIMEOUT_MS` (30000), `PUPPETEER_RENDERS_PER_BROWSER` (1000), `PUPPETEER_BROWSER_TTL_MS` (86400000), `PUPPETEER_NO_SANDBOX` |
| Numbering | `DOCUMENT_NUMBER_START` (7100001) |
| SPA / інше | `SPA_DIST_DIR`, `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `LOG_LEVEL`, `LOG_HTTP_REQUESTS` |

У проді `superRefine` додатково: відхиляє локальний `APP_PUBLIC_URL`
(`http://localhost…` / `http://127.…`) — задавайте реальний https-origin;
блокує відомі placeholder-секрети JWT і нульовий dev-ключ TOTP. Решта перевірок
діє **лише для активної CRM**. При `CRM_PROVIDER=monday` обов'язкові
`MONDAY_API_TOKEN` і `MONDAY_WEBHOOK_SECRET` (≥16 символів, напр.
`openssl rand -hex 24`; секрет — частина URL вебхука, тож поводьтеся з ним як із
секретом), `MONDAY_API_BASE_URL` має бути рівно `https://api.monday.com/v2`
(SSRF-захист), а три `MONDAY_BOARD_*` — різними. HubSpot-перевірки (токен,
webhook-секрет, базовий URL) у цьому режимі не застосовуються. Зверніть увагу:
порожнє `HUBSPOT_API_TOKEN=` означає «не задано», але непорожнє значення за
будь-якого провайдера мусить починатися з `pat-`, тому змінні HubSpot у шаблонах
закоментовані — не розкоментовуйте їх і не ставте туди плейсхолдер. У
`.env.production.example` задано `CRM_PROVIDER=monday`; у `.env.example` для
розробки цей рядок закоментовано (частина серверних тестів розраховує на дефолт
коду). `MONDAY_API_TOKEN=` у `.env.production.example` навмисно порожній: із
порожнім токеном прод не стартує, тож забутий токен видно одразу. Неправильний
чи відкликаний токен старт **не** зупиняє — його видно лише під час роботи: ERROR
`[startup] monday API version assertion FAILED` у лозі та `"monday":"fail"`
(HTTP 503) на `/ready`. Плейсхолдер
`MONDAY_WEBHOOK_SECRET=<REQUIRED>` коротший за 16 символів, тож старт зупиняє.

---

## 15. Як запустити локально

Вимоги: **Node 20** (`.nvmrc`), npm, Docker (для Postgres).

```bash
# 1. Підняти Postgres (127.0.0.1:5433)
docker compose -f docker-compose.dev.yml up -d

# 2. Залежності
npm install

# 3. Конфіг
cp .env.example .env          # заповнити секрети (розділ 14)

# 4. Міграції
npm run db:migrate

# 5. Перший користувач (інтерактивно)
npm run create-user

# 6. Два dev-процеси (окремі термінали)
npm run dev          # Vite SPA  → http://localhost:5173
npm run dev:server   # Express API → :8080 (tsx watch)
```

Корисне: `npm run db:studio` (Drizzle Studio), `npm run monday:backfill`
(засіяти компанії/угоди з monday.com; потрібні `CRM_PROVIDER=monday` і
`MONDAY_API_TOKEN` у `.env`).

---

## 16. Типові задачі

- **Додати API-ендпоінт:** створити/розширити зріз `server/modules/<feature>/`
  (routes → controller → service → repository → schemas), змонтувати роутер у
  `server/app.ts`, додати Zod-схему + інтеграційний тест.
- **Змінити БД:** редагувати `server/db/schema/*.ts` → `npm run db:generate` →
  переглянути SQL → `npm run db:migrate`.
- **Додати сторінку фронтенду:** додати у `src/pages/`, підключити маршрут +
  гейт у `App.tsx`, додати обгортку в `src/api/`, чиї типи дзеркалять
  бекенд-схему.
- **Створити користувача:** `npm run create-user`. **Засіяти/оновити дані з
  CRM:** `npm run monday:backfill` (ідемпотентний, безпечний будь-коли).
- **Чіпати калькулятор:** не варто — тільки з явним дозволом (розділ 5.1).

---

## 17. Нюанси та застереження

- **Формат номера документа** — це `BSG-<7 цифр>-<6 цифр>` (напр.
  `BSG-7100001-874808`), **а не** просто `BSG-#####`. Друга частина — останні 6
  цифр `hubspot_company_id` (для компаній, створених у monday, ключ має вигляд
  `mon:<itemId>`, тож це останні 6 цифр id картки monday).
- **`nginx/default.conf` — мертвий конфіг.** Актуальна модель — один контейнер,
  де Express сам роздає статику, а edge-проксі — **Traefik**, не nginx. У
  compose-файлах nginx-сервісу немає.
- **CI не покриває бекенд** (`test:server` / `typecheck:server` потребують живого
  Postgres). Регресії бекенду ловляться лише локально — не забувайте ганяти їх
  перед пушем.
- **Перевірте `JWT_REFRESH_EXPIRES` на живому сервері.** Шаблони задають `12h`
  (безпечне значення), але історично на сервері зустрічалось `30d`. Якщо там досі
  `30d` — refresh-сесії живуть 30 днів замість 12 годин; вирівняйте перед тим, як
  покладатись на «коротку сесію».
- **Raw-body парсер вебхука HubSpot** (легасі-приймач; вебхуку monday він не
  потрібен) прив'язаний рівно до одного шляху. Ніколи не розширюйте його
  область — інакше він «затінить» JSON-парсинг для кожного POST.
- **Стан калькулятора не персиститься** сам по собі — тільки явним збереженням у
  `calculator_configs`. Не покладайтесь на «він десь у БД».
- **Frontend — один бандл** (без code-splitting), ~0.8 МБ. Для внутрішнього
  інструмента це прийнятно; за потреби — route-level `import()`.
- **`CRM_PROVIDER` у коді за замовчуванням — `hubspot`.** Зміну дефолту свідомо
  відкладено (на ньому тримаються тести). Без явного `CRM_PROVIDER=monday`
  застосунок стартує в режимі HubSpot: monday-цикли не запускаються, а в проді
  env-валідація вимагатиме токен і секрет HubSpot-акаунта, якого вже немає.
  Задавайте `CRM_PROVIDER=monday` явно у кожному dev- і prod-розгортанні
  (тести — див. розділ 12).
- **Назви з «hubspot» — легасі** (`hubspot_company_id`, `hubspot_modified_at`,
  `hubspotSyncState`, `HUBSPOT_SYNC_TTL_SECONDS`, `AUTO_SYNC_TO_HUBSPOT`,
  `/api/v1/hubspot/*` тощо): вони описують дані й поведінку monday-ери.
  Перейменування відкладене — не перейменовуйте їх точково (розділ 11).
- **Найнебезпечніший збій інтеграції — тиша.** Порожня черга вебхуків виглядає
  так само, як CRM, яку ніхто не редагує, а пейджингу немає. Стежте за рядками
  `[monday:health]` у логах і `mondayWebhookQueue` на `/ready`.
```
