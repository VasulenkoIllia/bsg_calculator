// Master Service Agreement long-form text.
//
// Source of truth: `DRAFT TEXT.docx` (provided 2026-05-03).
// The text is treated as a static template — only counterparty placeholder
// fields are substituted at render time (handled in `parties.ts` and
// `signatureBlock.ts`). Body content below mirrors the draft 1:1, including
// list structure, ALL-CAPS headings, and standalone Dispute Resolution
// sub-headings.

export type AgreementListItem =
  | string
  | { text: string; subItems: string[] };

export type AgreementBlock =
  | string
  | { kind: "paragraph"; text: string }
  | { kind: "lead"; subtitle: string; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; items: AgreementListItem[] };

export interface AgreementSection {
  title: string;
  blocks: AgreementBlock[];
}

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: "Overview of this Agreement",
    blocks: [
      "These Merchant Terms and Conditions (the “Terms and Conditions”) govern and are incorporated into the Agreement between Service Provider and Merchant. Service Provider, subject to the provisions of this paragraph, may amend the Terms and Conditions in its sole discretion and at any time. The most recent version of the Terms and Conditions (as may be amended by Service Provider from time to time) will be available:",
      {
        kind: "list",
        items: [
          "in Service Provider Merchant Center, and/or",
          "as part of the Service Provider Merchant Newsletter."
        ]
      },
      "Merchant agrees that either or both of these notification methods constitute adequate notice to inform Merchant of any amendments to the Agreement and Merchant further agrees to be bound by any such amendments to the Agreement upon such notification."
    ]
  },
  {
    title: "Your Service Provider Account",
    blocks: [
      "To register for a Service Provider Account, you or the person or people submitting the application (your “Representative”) must provide with full corporate KYC, shareholder KYC and filled in our onboarding document (https://wkf.ms/3OzLkJP). Until you have submitted, and we have reviewed and approved, all required information, your Service Provider Account will be available to you on a preliminary basis only, and we may terminate it at any time and for any reason.",
      "If you use Services under this agreement, your name (or the name used to identify you) and URL may appear on your Customers’ bank or other statements. To minimize confusion and avoid potential disputes, these descriptors must be recognizable to your Customers and must accurately describe your business or activities. You may only use Services to facilitate Transactions (as defined below) with your Customers. You may not use Services to conduct any personal transactions or for peer-to-peer money transmission, or for any other purposes prohibited by this Agreement."
    ]
  },
  {
    title: "Validation and Underwriting",
    blocks: [
      "At any time during the term of this Agreement and your use of the Services, we may require additional information from you to verify beneficial ownership or control of the business, validate information you provided, verify you or your Representative’s identity, and assess your financial condition and the risk associated with your business. This additional information may include business invoices, copies of government-issued identification, business licenses, or other information related to your business, its beneficial owners or principals. If you use Services, we may also request that you provide copies of financial statements, reporting and validating documentation that allows us to calculate outstanding credit exposure/risk of loss (for example, management or internal accounts, your refund and shipping policies, data on captured but unfulfilled charges, the time between charge capture and fulfillment of your Customer orders), or other records pertaining to your compliance with this Agreement. We may also require you to provide a personal or company guarantee. Your failure to provide this information or material may result in suspension or termination of your Service Provider Account.",
      "You authorise us to retrieve information about you from our service providers and other third parties, including credit reporting agencies and information bureaus and you authorise and direct such third parties to compile and provide such information to us. You acknowledge that this may include your name, addresses, credit history, and other data about you or your Representative. You acknowledge that we may use your information to verify any other information you provide to us, and that any information we collect may affect our assessment of your overall risk to our business. You acknowledge that in some cases, such information may lead to suspension or termination of your Service Provider Account. Service Provider may periodically update this information as part of our underwriting criteria and risk analysis procedures."
    ]
  },
  {
    title: "Your Relationship with Your Customers",
    blocks: [
      "You may only use the Services for legitimate Transactions with your Customers. You know your Customers better than we do, and you are responsible for your relationship with them. Service Provider is not responsible for the products or services you publicize or sell, or that your Customers purchase using the Services; or if you accept donations, for your communication to your Customers of the intended use of such donations. You affirm that you are solely responsible for the nature and quality of the products or services you provide, and for delivery, support, refunds, returns, and for any other ancillary services you provide to your Customers.",
      "Service Provider provides Services to you but we have no way of knowing if any particular purchase, sale, donation, order, or other transaction (each a “Transaction”) is accurate or complete, or typical for your business. You are responsible for knowing whether a Transaction initiated by your Customer is erroneous (such as a Customer purchasing one item when they meant to order another) or suspicious (such as unusual or large purchases, or a request for delivery to a foreign country where this typically does not occur). If you are unsure if a Transaction is erroneous or suspicious, you agree to research the Transaction and, if necessary, contact your Customer before fulfilling or completing the Transaction. You are solely responsible for any losses you incur due to erroneous or fraudulent Transactions in connection with your use of the Services."
    ]
  },
  {
    title: "Responsibilities and Disclosures to Your Customers",
    blocks: [
      "It is very important to us that your Customers understand the purpose, amount, and conditions of Charges you submit to us. With that in mind, when using the Services you agree to:",
      {
        kind: "list",
        items: [
          "accurately communicate, and not misrepresent, the nature of the Transaction, and the amount of the Charge in the appropriate currency prior to submitting it to the API;",
          "provide a receipt that accurately describes each Transaction to Customers;",
          "provide Customers a meaningful way to contact you in the event that the product or service is not provided as described;",
          "not use Services to sell products or services in a manner that is unfair or deceptive, exposes Customers to unreasonable risks, or does not disclose material terms of a purchase in advance; and",
          "inform Customers that Service Provider and its affiliates process Transactions (including payment Transactions) for you."
        ]
      },
      "You also agree to maintain and make available to your Customers a reasonable return, refund, cancellation, or adjustment policy, and clearly explain the process by which Customers can receive a Refund.",
      "The Services may include functionality that enables you to receive recurring or subscription payments from your Customers, and to issue invoices to your Customers. If you use the Services to submit recurring or subscription Charges, you agree to comply with applicable Laws and Payment Method Rules, including clearly informing Customers in advance of submitting the initial Charge that they will be charged on an ongoing basis and explaining the method for unsubscribing or canceling their recurring billing or subscription. If you use the Services to issue invoices to your Customers, you understand and agree that it is your responsibility to ensure that the form and content of the invoices comply with applicable Laws, and are sufficient to achieve any legal or tax effect that you are trying to achieve.",
      "If you engage in Transactions with Customers who are individuals (i.e. consumers), you specifically agree to provide consumers disclosures required by Law, and to not engage in unfair, deceptive, or abusive acts or practices.",
      "Service Provider reserves the continuing right to reject, revise, or discontinue any Merchant Offering, at any time and for any reason in Service Provider’s sole discretion, and to terminate this Service Agreement.",
      "Merchant agrees to accept returns of the Merchant Offering in compliance with applicable laws and the Fine Print, but in any event:",
      {
        kind: "list",
        items: [
          "will accept returns of a defective Merchant Offering or nonconforming items in or a part of any Merchant Offering at all times and pay (or reimburse a purchaser for) any and all costs associated with the return of such Merchant Offering; and",
          "will not impose a more restrictive return policy on purchasers than Merchant’s regular return policy as applied to Merchant’s purchaser in the ordinary course of Merchant’s business."
        ]
      },
      "Service Provider is permitted to refund the client up to the full amount of transactions at its own discretion. Merchant will be notified of such and the refunded amount will be deducted from the next remittance."
    ]
  },
  {
    title: "Payment",
    blocks: [
      {
        kind: "lead",
        subtitle: "Tax Levy",
        text: "In the event Service Provider receives written notice of a validly issued state or federal tax levy relating to past-due taxes owed by Merchant, Service Provider may, in accordance with applicable law, deduct any such amounts from payments due to Merchant."
      },
      {
        kind: "lead",
        subtitle: "Taxes Generally",
        text: "It is Merchant’s responsibility to determine what, if any, taxes apply to the payments Merchant makes or receives, and it is Merchant’s responsibility to collect, report and remit the correct tax to the appropriate tax authority. Service Provider is not responsible for determining whether taxes apply to Merchant’s transaction with either purchasers or Service Provider, or for collecting, reporting or remitting any taxes arising from any transaction with or by Merchant and purchaser. Merchant may be asked to provide Service Provider with a valid Tax Identification Number for tax reporting purposes. Notwithstanding anything else in this Agreement, Merchant shall be, and will remain, registered for sales, use and other similar tax collection purposes in all states and localities in which Merchant is required to be so registered in connection with the Merchant Offering and pursuant to the terms and the transactions, and shall be responsible for paying any and all sales, use or any other taxes related to the goods and services."
      },
      {
        kind: "lead",
        subtitle: "Transaction Taxes",
        text: "Merchant bears sole financial responsibility for any and all sales, use, excise, general, GST, or other similar taxes, including any interest penalties and additions related thereto, imposed on or arising from the transactions contemplated by this Agreement between Service Provider and Merchant (“Transaction Taxes”), if any. Service Provider shall apply the applicable Transaction Tax to the amounts it retains and/or other fees remitted to Service Provider pursuant this Agreement. Transaction Taxes are calculated using the Merchant’s billing address and will be included on invoices. Tax rates are subject to change. If applied, Transaction Taxes will be calculated at the time of each payment using the rates in effect under current law."
      },
      {
        kind: "lead",
        subtitle: "Withholding Taxes",
        text: "Service Provider may be required by tax authorities to withhold taxes on behalf of Merchant. Service Provider reserves the right to deduct any such taxes from amounts due to Merchant and to remit them to the appropriate tax authority. Service Provider may also be required to report the withholding tax payments to the tax authorities. Service Provider shall provide evidence of payment of withholding taxes to Merchant no later than 60 days after payment of the withholding taxes."
      },
      "Notwithstanding anything to the contrary, Service Provider will have no obligation to advance amounts that have been paid to Service Provider by a purchaser until Merchant has complied with Merchant’s obligations under this Agreement. If Service Provider reasonably believes that Merchant has breached any provision of this Agreement, Service Provider may offset, delay, withhold, or suspend future payments to Merchant, in Service Provider’s sole discretion. In addition, if Merchant is unwilling to, or in Service Provider’s reasonable discretion appears unable to, perform its obligations under this Agreement, Service Provider is authorized to offset, delay, withhold, or suspend future payments to Merchant in addition to such other remedies as may be available under this Agreement or at law, to secure payment from Merchant for any refunds and/or other amounts payable by Merchant under this Agreement.",
      "Service Provider will not be held liable for any amounts offset, delayed, suspended, or withheld by other financial institutions.",
      "Payment will be made with presentation of an invoice from Merchant based on report sent out from Service Provider to the Merchant. Failure to provide Service Provider with an invoice may delay receipt of payment by Merchant.",
      "Payment terms are to be found in Appendix A."
    ]
  },
  {
    title: "Customer Data Restrictions",
    blocks: [
      "“Customer Data” means all identifiable information about purchasers generated or collected by Service Provider or Merchant, including, but not limited to, purchasers’ name, shipping addresses, email addresses, phone numbers, purchaser preferences and tendencies, and financial transaction data.",
      "Merchant represents, warrants and covenants that it will not resell, broker or otherwise disclose any Customer Data to any third party, in whole or in part, for any purpose, unless required by applicable law. If Merchant engages any third party to facilitate its redemption obligations hereunder, Merchant shall ensure that such third party implements and complies with reasonable security measures in handling any Customer Data. If any Customer Data is collected directly by Merchant or a third party engaged by Merchant to facilitate its redemption obligations hereunder, Merchant shall ensure that it or such third party adopts, posts and processes the Customer Data in conformity with its posted privacy policy and all applicable laws.",
      "As long as Merchant uses Customer Data in compliance with applicable law and Merchant’s posted privacy policy, restrictions stated in this Agreement on Merchant’s use of Customer Data do not apply to:",
      {
        kind: "list",
        items: [
          "data from any purchaser who is already a customer of Merchant before the Effective Date, if such data was provided to Merchant by such purchaser independent of this Agreement or any transaction hereunder; or",
          "data supplied by a purchaser directly to Merchant who becomes a customer of Merchant in connection with such purchaser explicitly opting in to receive communications from Merchant."
        ]
      },
      "Merchant shall immediately notify Service Provider if Merchant becomes aware of or suspects any unauthorized access to or use of Customer Data or any confidential information of Service Provider, and shall cooperate with Service Provider in the investigation of such breach and the mitigation of any damages. Merchant will bear all associated expenses incurred by Service Provider to comply with applicable laws (including, but not limited to, any data breach laws) or arising from any unauthorized access or acquisition of Customer Data while such data is in Merchant’s reasonable possession or control. Upon termination or expiration of this Agreement, Merchant shall, as directed by Service Provider, destroy or return to Service Provider all the Customer Data in Merchant’s or any agent of Merchant’s possession."
    ]
  },
  {
    title: "Term and Termination",
    blocks: [
      "This Agreement will continue in effect until terminated by either party in accordance with this Section (“Term”). Service Provider is authorized to terminate this Agreement, at any time for any reason, upon written notice to Merchant. Merchant is authorized to terminate this Agreement upon seven (7) business days prior written notice to Service Provider. Provisions in this Agreement that are intended to survive termination will continue in full force and effect after the Term."
    ]
  },
  {
    title: "Intellectual Property Rights",
    blocks: [
      "Merchant grants to Service Provider a non-exclusive, worldwide, royalty free, paid-up, perpetual, irrevocable, transferable and sub-licensable license and right to use, modify, reproduce, sublicense, publicly display, distribute, broadcast, transmit, stream, publish and publicly perform:",
      {
        kind: "list",
        items: [
          "Merchant’s name, logos, trademarks, service marks, domain names, and any audiovisual content, video recordings, audio recordings, photographs, graphics, artwork, text and any other content provided, specified, recommended, directed, authorized or approved to use by Merchant (collectively, “Merchant IP”); and",
          "any third party’s name, logos, trademarks, service marks, domain names, audiovisual recordings, video recordings, audio recordings, photographs, graphics, artwork, text and any other content provided, specified, recommended, directed, authorized or approved for use by Merchant (collectively, “Third Party IP”), in each case in connection with the promotion, sale/resale (as may be applicable) or distribution of the Merchant Offering in all media or formats now known or hereinafter developed (“License”). Any use of the Merchant IP or Third Party IP as contemplated in this Agreement is within Service Provider ’s sole discretion."
        ]
      },
      "Merchant acknowledges and agrees that, as between the parties, Service Provider owns all interest in and to the Website, Customer Data, Service Provider trade names, logos, trademarks, service marks, domain names, social media identifiers, all data collected through or from the Website, all audiovisual content, video recordings, audio recordings, photographs, graphics, artwork, text or any other content created by Service Provider or at Service Provider ’s direction, or assigned to Service Provider , and any materials, software, technology or tools used or provided by Service Provider to promote, sell/resell (as may be applicable) or distribute the Merchant Offering and conduct its business in connection therewith (collectively “Service Provider IP”). Merchant shall not use, sell, rent, lease, sublicense, distribute, broadcast, transmit, stream, place shift, transfer, copy, reproduce, download, time shift, display, perform, modify or timeshare the Service Provider IP or any portion thereof, or use such Service Provider IP as a component of or a base for products or services prepared for commercial use, sale, sublicense, lease, access or distribution, except that Service Provider grants Merchant a limited, non-exclusive, revocable, non-transferable, non-sub licensable license during the Term to use one copy of Service Provider’s mobile merchant software application on a single website for the purposes permitted by that software. Merchant shall keep the Service Provider IP confidential, and shall not prepare any derivative work based on the Service Provider IP or translate, reverse engineer, decompile or disassemble the Service Provider IP. Merchant shall not take any action to challenge or object to the validity of Service Provider’s rights in the Service Provider IP or Service Provider’s ownership or registration thereof. Except as specifically provided in this Agreement, Merchant and any third party assisting Merchant with its obligations in this Agreement, are not authorized to use Service Provider IP in any medium without prior written approval from an authorized representative of Service Provider. Merchant shall not include any trade name, trademark, service mark, domain name, social media identifier, of Service Provider or its affiliates, or any variant or misspelling thereof, in any trademark, domain name, email address, social network identifier, metadata or search engine keyword. Merchant shall not use or display any Service Provider IP in a manner that could reasonably imply an endorsement, relationship, affiliation with, or sponsorship between Merchant or a third party and Service Provider. All rights to the Service Provider IP not expressly granted in this Agreement are reserved by Service Provider.",
      "If Merchant provides Service Provider or any of its affiliates with feedback, suggestions, reviews, modifications, data, images, text, or other information or content about a Service Provider product or service or otherwise in connection with this Agreement, any Service Provider IP, or Merchant’s participation in the Merchant Offering (collectively, “Feedback”), Merchant irrevocably assigns to Service Provider all right, title, and interest in and to Feedback. In the event your assignment to Service Provider is invalid for any reason, you hereby irrevocably grant Service Provider and its affiliates a perpetual, paid-up, royalty-free, nonexclusive, worldwide, irrevocable, freely transferable right and license to",
      {
        kind: "list",
        items: [
          "use, reproduce, perform, display, and distribute Feedback;",
          "adapt, modify, re-format, and create derivative works of Feedback for any purpose and sublicense the foregoing rights to any other person or entity."
        ]
      },
      "Merchant warrants that:",
      {
        kind: "list",
        items: [
          "Feedback is Merchant’s original work, or Merchant obtained Feedback in a lawful manner; and",
          "Service Provider and its sublicensees’ exercise of rights under the license above will not violate any person’s or entity’s rights, including any copyright rights."
        ]
      },
      "Merchant agrees to provide Service Provider such assistance as Service Provider might require to document, perfect, or maintain Service Provider’s rights in and to Feedback."
    ]
  },
  {
    title: "Representations and Warranties",
    blocks: [
      "Merchant represents and warrants that:",
      {
        kind: "list",
        items: [
          "Merchant has the right, power and authority to enter into this Agreement;",
          "Merchant, if required by applicable law, is registered for sales and use tax collection purposes in all jurisdictions where Merchant’s goods and services will be provided;",
          "the transactions , will be available immediately for redemption and Merchant will have sufficient goods and/or services available for redemption (i.e., a number of goods and/or services sufficient to fulfill its redemption obligations in connection);",
          "the terms and conditions of the transactions, including any discounts or goods and services offered thereunder do not and will not violate any, local, state, provincial, territorial or federal law, statute, rule, regulation, or order, including but not limited to, any law or regulation governing the use, sale, and distribution of alcohol and any laws governing transactions;",
          "the Merchant’s purchase of transaction will result in the bona fide provision of goods and/or services by Merchant to the purchaser;",
          "Merchant owns all interest in and to the Merchant IP and has licensing rights in (with the right to sublicense to Service Provider ) the Third Party IP, and has the right to grant the License stated in this Agreement;",
          "the Merchant IP and the Third Party IP, Service Provider ’s use of, and the results of such Merchant Offerings, will not infringe, dilute, misappropriate, or otherwise violate, anywhere in the world, any patent, copyright, logo, trademark, service mark, trade name, rights in designs, or other intellectual property right or right of privacy or publicity of any third party or any applicable law, and does not and will not result from the misappropriation of any trade secret or the breach of any confidentiality obligations to any person or entity;",
          "the Merchant IP and Third Party IP does not include any material that is unlawful, threatening, abusive, defamatory, vulgar, obscene, profane or otherwise objectionable, or that encourages conduct that constitutes a criminal offense, gives rise to civil liability or otherwise violates any law;",
          "any advertising or promotion of Merchant’s goods and services relating thereto will not constitute false, deceptive or unfair advertising or disparagement under any applicable law;",
          "Merchant and its employees, contractors and agents have had the proper education and training and hold all required and up-to-date regulatory authorization, licenses and certifications relating to any Merchant Offering to provide the goods or services described in this Agreement;",
          "Merchant’s business information and direct deposit details as provided in this Agreement, indicating where payments should be forwarded are accurate and Merchant is the authorized entity to receive the funds forwarded by Service Provider ;",
          "Merchant is not authorized to resell, broker or otherwise disclose any Customer Data (as defined in this Agreement) to any third party, in whole or in part, for any purpose, and Merchant is not authorized to copy or otherwise reproduce any Customer Data other than for the purpose of using or verifying the validity of transactions in connection with this Agreement and",
          {
            text: "the Merchant Offering is:",
            subItems: [
              "free from defects in workmanship, materials and design,",
              "merchantable and suitable for the purposes, if any, stated in the Agreement, and",
              "genuine, bona fide products, as described herein and does not violate the rights of any third party."
            ]
          }
        ]
      }
    ]
  },
  {
    title: "Indemnification",
    blocks: [
      "To the extent allowed under applicable law, Merchant agrees to defend, indemnify and hold Service Provider, its affiliated and related entities, and any of its respective officers, directors, agents and employees, harmless from and against any claims, lawsuits, investigations, penalties, damages, losses or expenses (including but not limited to reasonable attorneys’ fees and costs) arising out of or relating to any of the following:",
      {
        kind: "list",
        items: [
          "any breach or alleged breach by Merchant of this Agreement, or the representations and warranties made in this Agreement;",
          "any claim for state sales, use, or similar tax obligations of Merchant arising from the sale and use of transactions;",
          "any claim by any local, state, provincial, territorial or federal governmental entity for any amounts under any applicable abandoned or unclaimed property or escheat law, including but not limited to any claims for penalties and interest;",
          "any claim arising out of a violation of any law or regulation by Merchant or governing Merchant’s goods and/or services;",
          "any claim arising out of Merchant’s violation of law or regulation governing the use, sale, and distribution of alcohol;",
          "any claim by a purchaser or anyone else arising out of or relating to the goods and services provided by Merchant and/or pick up of the goods and services at the Redemption Site, including but not limited to, any claims for false advertising, product defects, personal injury, death, or property damages;",
          "any claim by a purchaser for the Amount Paid;",
          "any claim arising out of Merchant’s misuse of Customer Data, or any violation of an applicable data privacy or security law; and",
          "any claim arising out of Merchant’s negligence, fraud or willful misconduct."
        ]
      },
      "Service Provider maintains the right to control its own defense and to choose and appoint its own defense counsel, regardless of the presence or absence of a conflict of interest between Service Provider and Merchant. Merchant’s duty to defend and indemnify Service Provider includes the duty to pay Service Provider’s reasonable attorneys’ fees and costs, including any expert fees."
    ]
  },
  {
    title: "Confidentiality",
    blocks: [
      "The terms for the Merchant Offering described in this Agreement are confidential, and Merchant agrees not to disclose the terms described in this Agreement to any party (other than to its employees, parent companies, shareholders, lawyers, and accountants on a strict need-to-know basis or as required by applicable public records and other law, if Merchant has taken the necessary precautions of the kind generally taken with confidential information to preserve the confidentiality of the information made available to such parties). In the event of a breach, Service Provider is entitled to injunctive relief and a decree for specific performance, and any other relief allowed under applicable law (including monetary damages if appropriate)."
    ]
  },
  {
    title: "Limitation of Liability",
    blocks: [
      "EXCEPT FOR MERCHANT’S INDEMNIFICATION OBLIGATIONS HEREUNDER, IN NO EVENT IS EITHER PARTY LIABLE OR OBLIGATED TO THE OTHER PARTY OR ANY THIRD PARTY FOR ANY LOST PROFITS, LOST BUSINESS, SPECIAL, INCIDENTAL, EXEMPLARY, CONSEQUENTIAL, PUNITIVE, OR INDIRECT DAMAGES REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT OR OTHERWISE, EVEN IF INFORMED OF THE POSSIBILITY OF ANY SUCH DAMAGES IN ADVANCE. SERVICE PROVIDER ’ SOLE AND COMPLETE LIABILITY TO MERCHANT FOR ANY CLAIMS ARISING OUT OF OR RELATING TO THIS AGREEMENT, OR ANY ERRORS, OMISSIONS OR MISPLACEMENTS OF ANY TRANSACTIONS IS LIMITED TO THE AMOUNT OF FEES RETAINED BY SERVICE PROVIDER HEREUNDER FOR THE PRECEDING SIX (6) MONTHS AFTER FINAL CALCULATION AND RECONCILIATION OF ALL REFUNDS. THIS LIMITATION OF LIABILITY APPLIES TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW AND NOTWITHSTANDING THE FAILURE OF ANY LIMITED REMEDY. IN ADDITION, ANY CLAIM BY OR ON BEHALF OF A MERCHANT IN CONNECTION WITH ANY PAYMENT MADE BY SERVICE PROVIDER, INCLUDING, BUT NOT LIMITED TO, CLAIMS ALLEGING THAT A MERCHANT WAS UNDERPAID, MUST BE MADE IN WRITING TO SERVICE PROVIDER WITHIN NINETY (90) DAYS FROM THE DATE SERVICE PROVIDER REMITS THE PAYMENT AT ISSUE. ALL CLAIMS NOT MADE IN ACCORDANCE WITH THE FOREGOING SHALL BE DEEMED WAIVED, RELEASED AND DISCHARGED BY MERCHANT."
    ]
  },
  {
    title: "Dispute Resolution",
    blocks: [
      "All disputes arising out of, or relating in any way to this Agreement, shall be resolved pursuant to this Section 14 Dispute Resolution.",
      { kind: "heading", text: "Binding Arbitration" },
      "EXCEPT AS SPECIFICALLY STATED HEREIN, ANY DISPUTE OR CLAIM BETWEEN MERCHANT AND SERVICE PROVIDER ARISING OUT OF, OR RELATING IN ANY WAY TO, THIS AGREEMENT (“DISPUTES”) SHALL BE RESOLVED EXCLUSIVELY BY FINAL, BINDING ARBITRATION. BY VIRTUE OF THE AGREEMENT IN THIS SECTION 14 TO ARBITRATE, MERCHANT AND SERVICE PROVIDER ARE EACH GIVING UP THE RIGHT TO GO TO COURT AND HAVE A DISPUTE HEARD BY A JUDGE OR JURY (EXCEPT AS OTHERWISE SET FORTH IN THIS SECTION 14). The provisions of this Section 14 shall constitute Merchant’s and Service Provider’s written agreement to arbitrate Disputes under the Arbitration Act of 1996 (United Kingdom). The arbitration will be administered by the London Court of International Arbitration (“LCIA”) and conducted before a single arbitrator pursuant to its applicable rules. The arbitrator will apply and be bound by this Agreement, apply applicable law and the facts, and issue a reasoned award.",
      "To begin an arbitration proceeding, Merchant or Service Provider must comply with the limitations provision set forth in Section 13 and submit the Dispute by making a demand for arbitration as detailed at http://www.lcia.org. If Merchant demands arbitration, it shall simultaneously send a copy of the completed demand to the following addresses: 1) 3200 - 650 West Georgia Street, Vancouver BC V6B 4P7, Canada (“KASEF PAY”). If Service Provider demands arbitration, it shall send a copy of the completed demand to the Merchant’s address of record. Payment of all filing, administration and arbitrator fees will be governed by the LCIA’s rules. Service Provider will reimburse those fees for Disputes totaling less than $10,000 if Merchant is the prevailing party in such arbitration. Service Provider will not seek attorneys’ fees and costs in arbitration unless the arbitrator determines that a Merchant Dispute is frivolous. The arbitration will be conducted based upon written submissions unless Merchant requests and/or the arbitrator determines that a telephone or in-person hearing is necessary. If the arbitrator grants the request or determines an in-person hearing is necessary, the hearing will proceed in London, UK.",
      { kind: "heading", text: "Class Action Waiver" },
      "WE EACH AGREE THAT WE SHALL BRING ANY DISPUTE AGAINST THE OTHER IN OUR RESPECTIVE INDIVIDUAL CAPACITIES AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, REPRESENTATIVE PROCEEDING OR AS AN ASSOCIATION. IN ADDITION, WE EACH AGREE THAT DISPUTES SHALL BE ARBITRATED ONLY ON AN INDIVIDUAL BASIS AND NOT IN A CLASS, CONSOLIDATED OR REPRESENTATIVE ACTION. THE ARBITRATOR DOES NOT HAVE THE POWER TO VARY THESE PROVISIONS.",
      { kind: "heading", text: "Choice of Law/No Jury Trial" },
      "If for any reason a Dispute proceeds in court:",
      {
        kind: "list",
        items: [
          "Merchant and Service Provider agree that any such Dispute may only be instituted in a state or federal court in London, UK;",
          "Merchant and Service Provider irrevocably consent and submit to the exclusive personal jurisdiction and venue of such courts for resolution of such Disputes;",
          "Merchant and Service Provider agree that the Arbitration Act of 1996, the LCIA rules, applicable law of the UK, without regard to principles of conflicts of law, will govern this Agreement and any Disputes; and",
          "MERCHANT AND SERVICE PROVIDER AGREE TO WAIVE ANY RIGHT TO A TRIAL BY JURY."
        ]
      },
      { kind: "heading", text: "Injunctive Relief/Attorneys’ Fees" },
      "Notwithstanding anything to the contrary in this Agreement, either party may bring suit in court seeking an injunction or other equitable relief arising out of or relating to claims that the other party’s conduct may cause the other irreparable injury.",
      "In the event Service Provider is the prevailing party in any Dispute, subject to any exceptions in this Section 14, Merchant shall pay to Service Provider all reasonable attorneys’ fees and costs incurred by Service Provider in connection with any Dispute."
    ]
  },
  {
    title: "Other",
    blocks: [
      "The parties are independent contractors. Nothing in this Agreement is to be construed to create a joint venture, partnership, franchise, or an agency relationship between the parties. Neither party has the authority, without the other party’s prior written approval, to bind or commit the other in any way.",
      "Each Service Provider Entity shall be jointly and severally liable for the obligations of the Service Provider under this Agreement.",
      "This Agreement constitutes the entire agreement between the parties relating to its subject matter and supersedes all prior or contemporaneous oral or written agreements concerning such subject matter.",
      "Merchant is not authorized to transfer or assign its rights or obligations under this Agreement, whether by operation of law or otherwise, without Service Provider ’s prior written consent. Any waiver must be in writing and signed by an authorized signatory of Service Provider. Service Provider is authorized to transfer or assign this Agreement to a present or future affiliate or pursuant to a merger, consolidation, reorganization or sale of all or substantially all of the assets or business, or by operation of law, without notice to Merchant.",
      "If any provision of this Agreement should be held to be invalid or unenforceable, the validity and enforceability of the remaining provisions of this Agreement are not affected.",
      "EXCEPT AS EXPRESSLY STATED IN THIS AGREEMENT, NEITHER PARTY MAKES ANY REPRESENTATIONS OR WARRANTIES, EXPRESS NOR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE OR NON-INFRINGEMENT. SERVICE PROVIDER DOES NOT WARRANT OR GUARANTEE THAT THE SERVICES OFFERED ON OR THROUGH THE WEBSITE WILL BE UNINTERRUPTED OR ERROR-FREE, THAT THE TRANSACTIONS ARE ERROR-FREE, OR THAT ANY MERCHANT OFFERING WILL RESULT IN ANY REVENUE OR PROFIT FOR MERCHANT."
    ]
  }
];
