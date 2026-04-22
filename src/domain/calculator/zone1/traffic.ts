import {
  VOLUME_ROUNDING_STEP,
  normalizePercent,
  roundUpToStep,
  splitByPercent,
  splitIntegerByPercent,
  toInteger
} from "../shared/math.js";

export interface PayinTrafficInput {
  monthlyVolume: number;
  successfulTransactions: number;
  approvalRatioPercent: number;
  euPercent: number;
  ccPercent: number;
}

export interface PayoutTrafficInput {
  monthlyVolume: number;
  totalTransactions: number;
}

export interface NormalizedPayinTrafficInput {
  monthlyVolume: number;
  successfulTransactions: number;
  approvalRatioPercent: number;
  approvalRatio: number;
  euPercent: number;
  wwPercent: number;
  ccPercent: number;
  apmPercent: number;
}

export interface NormalizedPayoutTrafficInput {
  monthlyVolume: number;
  totalTransactions: number;
}

export interface RegionMethodBreakdown<T> {
  euCc: T;
  euApm: T;
  wwCc: T;
  wwApm: T;
}

export interface PayinTrafficDerived {
  normalized: NormalizedPayinTrafficInput;
  averageTransaction: number;
  volume: {
    total: number;
    eu: number;
    ww: number;
    cc: number;
    apm: number;
    byRegionMethod: RegionMethodBreakdown<number>;
  };
  successful: {
    total: number;
    eu: number;
    ww: number;
    cc: number;
    apm: number;
    byRegionMethod: RegionMethodBreakdown<number>;
  };
  attempts: {
    total: number;
    eu: number;
    ww: number;
    cc: number;
    apm: number;
    byRegionMethod: RegionMethodBreakdown<number>;
  };
  failed: {
    total: number;
    cc: number;
    apm: number;
    byRegionMethod: RegionMethodBreakdown<number>;
  };
}

export interface PayoutTrafficDerived {
  normalized: NormalizedPayoutTrafficInput;
  averageTransaction: number;
}

function splitRegionMethodCounts(
  total: number,
  euPercent: number,
  ccPercent: number
): RegionMethodBreakdown<number> {
  const totalInt = toInteger(total);
  const { primary: eu } = splitIntegerByPercent(totalInt, euPercent);
  const { primary: cc } = splitIntegerByPercent(totalInt, ccPercent);
  const apm = Math.max(0, totalInt - cc);
  const euCc = Math.min(eu, Math.max(0, Math.round(eu * (ccPercent / 100))));
  const euApm = Math.max(0, eu - euCc);
  const wwCc = Math.max(0, cc - euCc);
  const wwApm = Math.max(0, apm - euApm);

  return {
    euCc,
    euApm,
    wwCc,
    wwApm
  };
}

function splitRegionMethodVolume(
  total: number,
  euPercent: number,
  ccPercent: number
): RegionMethodBreakdown<number> {
  const { primary: eu, secondary: ww } = splitByPercent(total, euPercent);
  const { primary: euCc, secondary: euApm } = splitByPercent(eu, ccPercent);
  const { primary: wwCc, secondary: wwApm } = splitByPercent(ww, ccPercent);
  return { euCc, euApm, wwCc, wwApm };
}

export function normalizePayinTrafficInput(
  input: PayinTrafficInput
): NormalizedPayinTrafficInput {
  const monthlyVolume = roundUpToStep(
    Math.max(0, input.monthlyVolume),
    VOLUME_ROUNDING_STEP
  );
  const successfulTransactions = toInteger(input.successfulTransactions);
  const approvalRatioPercent = normalizePercent(input.approvalRatioPercent);
  const approvalRatio = approvalRatioPercent / 100;
  const euPercent = normalizePercent(input.euPercent);
  const wwPercent = 100 - euPercent;
  const ccPercent = normalizePercent(input.ccPercent);
  const apmPercent = 100 - ccPercent;

  return {
    monthlyVolume,
    successfulTransactions,
    approvalRatioPercent,
    approvalRatio,
    euPercent,
    wwPercent,
    ccPercent,
    apmPercent
  };
}

export function normalizePayoutTrafficInput(
  input: PayoutTrafficInput
): NormalizedPayoutTrafficInput {
  return {
    monthlyVolume: roundUpToStep(
      Math.max(0, input.monthlyVolume),
      VOLUME_ROUNDING_STEP
    ),
    totalTransactions: toInteger(input.totalTransactions)
  };
}

export function derivePayinTraffic(input: PayinTrafficInput): PayinTrafficDerived {
  const normalized = normalizePayinTrafficInput(input);
  const averageTransaction =
    normalized.successfulTransactions > 0
      ? normalized.monthlyVolume / normalized.successfulTransactions
      : 0;

  const { primary: euVolume, secondary: wwVolume } = splitByPercent(
    normalized.monthlyVolume,
    normalized.euPercent
  );
  const { primary: ccVolume, secondary: apmVolume } = splitByPercent(
    normalized.monthlyVolume,
    normalized.ccPercent
  );

  const successfulByRegionMethod = splitRegionMethodCounts(
    normalized.successfulTransactions,
    normalized.euPercent,
    normalized.ccPercent
  );
  const successfulEu = successfulByRegionMethod.euCc + successfulByRegionMethod.euApm;
  const successfulWw = successfulByRegionMethod.wwCc + successfulByRegionMethod.wwApm;
  const successfulCc = successfulByRegionMethod.euCc + successfulByRegionMethod.wwCc;
  const successfulApm =
    successfulByRegionMethod.euApm + successfulByRegionMethod.wwApm;

  const totalAttempts =
    normalized.approvalRatio > 0
      ? Math.ceil(normalized.successfulTransactions / normalized.approvalRatio)
      : normalized.successfulTransactions;
  const attemptsByRegionMethod = splitRegionMethodCounts(
    totalAttempts,
    normalized.euPercent,
    normalized.ccPercent
  );
  const attemptsEu = attemptsByRegionMethod.euCc + attemptsByRegionMethod.euApm;
  const attemptsWw = attemptsByRegionMethod.wwCc + attemptsByRegionMethod.wwApm;
  const attemptsCc = attemptsByRegionMethod.euCc + attemptsByRegionMethod.wwCc;
  const attemptsApm = attemptsByRegionMethod.euApm + attemptsByRegionMethod.wwApm;

  const failedByRegionMethod: RegionMethodBreakdown<number> = {
    euCc: Math.max(0, attemptsByRegionMethod.euCc - successfulByRegionMethod.euCc),
    euApm: Math.max(
      0,
      attemptsByRegionMethod.euApm - successfulByRegionMethod.euApm
    ),
    wwCc: Math.max(0, attemptsByRegionMethod.wwCc - successfulByRegionMethod.wwCc),
    wwApm: Math.max(
      0,
      attemptsByRegionMethod.wwApm - successfulByRegionMethod.wwApm
    )
  };
  const failedCc = failedByRegionMethod.euCc + failedByRegionMethod.wwCc;
  const failedApm = failedByRegionMethod.euApm + failedByRegionMethod.wwApm;
  const failedTotal = Math.max(0, totalAttempts - normalized.successfulTransactions);

  return {
    normalized,
    averageTransaction,
    volume: {
      total: normalized.monthlyVolume,
      eu: euVolume,
      ww: wwVolume,
      cc: ccVolume,
      apm: apmVolume,
      byRegionMethod: splitRegionMethodVolume(
        normalized.monthlyVolume,
        normalized.euPercent,
        normalized.ccPercent
      )
    },
    successful: {
      total: normalized.successfulTransactions,
      eu: successfulEu,
      ww: successfulWw,
      cc: successfulCc,
      apm: successfulApm,
      byRegionMethod: successfulByRegionMethod
    },
    attempts: {
      total: totalAttempts,
      eu: attemptsEu,
      ww: attemptsWw,
      cc: attemptsCc,
      apm: attemptsApm,
      byRegionMethod: attemptsByRegionMethod
    },
    failed: {
      total: failedTotal,
      cc: failedCc,
      apm: failedApm,
      byRegionMethod: failedByRegionMethod
    }
  };
}

export function derivePayoutTraffic(
  input: PayoutTrafficInput
): PayoutTrafficDerived {
  const normalized = normalizePayoutTrafficInput(input);
  const averageTransaction =
    normalized.totalTransactions > 0
      ? normalized.monthlyVolume / normalized.totalTransactions
      : 0;

  return {
    normalized,
    averageTransaction
  };
}
