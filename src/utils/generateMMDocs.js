// ─────────────────────────────────────────────────────────────────────────────
// generateMMDocs.js — Motion & Method LLC
// All documents built in code using the docx library
// Drop in: src/utils/generateMMDocs.js
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared docx helpers factory ─────────────────────────────────────────────
async function h() {
  const {
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    AlignmentType,
    BorderStyle,
    WidthType,
    ShadingType,
    LevelFormat,
    Header,
    Footer,
  } = await import("docx");

  const GREEN = "1C4A36";
  const GOLD = "EBC764";
  const WHITE = "FFFFFF";
  const GRAY = "6B7280";
  const LIGHT = "F7F4EA";
  const BLACK = "111827";
  const RED = "C0392B";
  const LIGHT_RED = "FEF2F2";

  const border = { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" };
  const brd = { top: border, bottom: border, left: border, right: border };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
  const noBrd = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
  };
  const cm = { top: 100, bottom: 100, left: 140, right: 140 };

  const run = (text, o = {}) =>
    new TextRun({ text, font: "Calibri", size: 22, color: BLACK, ...o });
  const bold = (text, o = {}) => run(text, { bold: true, ...o });
  const para = (children, o = {}) =>
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: Array.isArray(children) ? children : [run(children)],
      ...o,
    });
  const sp = (before = 160) =>
    new Paragraph({ spacing: { before, after: 0 }, children: [run("")] });
  const bul = (text, color = BLACK) =>
    new Paragraph({
      numbering: { reference: "bullets", level: 0 },
      spacing: { before: 60, after: 60 },
      children: [run(text, { color })],
    });
  const sec = (text, color = GREEN) =>
    new Paragraph({
      spacing: { before: 240, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 },
      },
      children: [run(text, { bold: true, size: 22, color, allCaps: true })],
    });

  const notice = (text, fill = "EFF6FF", tc = GREEN, bc = GREEN) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: {
                top: border,
                bottom: border,
                left: { style: BorderStyle.SINGLE, size: 12, color: bc },
                right: border,
              },
              shading: { fill, type: ShadingType.CLEAR },
              width: { size: 9360, type: WidthType.DXA },
              margins: { top: 120, bottom: 120, left: 240, right: 160 },
              children: [para([run(text, { size: 20, color: tc })])],
            }),
          ],
        }),
      ],
    });

  const infoTbl = (rows) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2520, 6840],
      rows: rows.map(
        ([label, value], i) =>
          new TableRow({
            children: [
              new TableCell({
                borders: brd,
                shading: {
                  fill: i % 2 === 0 ? "F1F5F9" : LIGHT,
                  type: ShadingType.CLEAR,
                },
                width: { size: 2520, type: WidthType.DXA },
                margins: cm,
                children: [para([bold(label, { color: GREEN })])],
              }),
              new TableCell({
                borders: brd,
                shading: {
                  fill: i % 2 === 0 ? WHITE : "FAFAFA",
                  type: ShadingType.CLEAR,
                },
                width: { size: 6840, type: WidthType.DXA },
                margins: cm,
                children: [para([run(value || "")])],
              }),
            ],
          }),
      ),
    });

  const twoColTbl = (headers, rows, colWidths) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({
          children: headers.map(
            (hd, i) =>
              new TableCell({
                borders: brd,
                shading: { fill: GREEN, type: ShadingType.CLEAR },
                width: { size: colWidths[i], type: WidthType.DXA },
                margins: cm,
                children: [para([bold(hd, { color: WHITE })])],
              }),
          ),
        }),
        ...rows.map(
          (row, ri) =>
            new TableRow({
              children: row.map(
                (cell, ci) =>
                  new TableCell({
                    borders: brd,
                    shading: {
                      fill: ri % 2 === 0 ? WHITE : LIGHT,
                      type: ShadingType.CLEAR,
                    },
                    width: { size: colWidths[ci], type: WidthType.DXA },
                    margins: cm,
                    children: [para([run(cell || "")])],
                  }),
              ),
            }),
        ),
      ],
    });

  const sigBlock = (
    mmName,
    mmTitle = "Authorized Signatory, M&M Operations LLC",
    counterpartyRole = "Client",
  ) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        new TableRow({
          children: ["M&M Operations", counterpartyRole].map(
            (p) =>
              new TableCell({
                borders: brd,
                shading: { fill: GREEN, type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                margins: cm,
                children: [para([bold(p, { color: WHITE })])],
              }),
          ),
        }),
        ...["Signature", "Printed Name", "Title", "Date"].map(
          (label, i) =>
            new TableRow({
              children: [
                new TableCell({
                  borders: brd,
                  shading: {
                    fill: i % 2 === 0 ? WHITE : LIGHT,
                    type: ShadingType.CLEAR,
                  },
                  width: { size: 4680, type: WidthType.DXA },
                  margins: { ...cm, top: 200, bottom: 200 },
                  children: [
                    para([
                      run(
                        label === "Signature"
                          ? "{{Signature;role=Motion & Method LLC}}"
                          : label === "Printed Name"
                            ? mmName
                            : label === "Title"
                              ? mmTitle
                              : label === "Date"
                                ? "{{Date;role=Motion & Method LLC}}"
                                : "",
                      ),
                    ]),
                    sp(40),
                    para([run(label, { size: 18, color: GRAY, italic: true })]),
                  ],
                }),
                new TableCell({
                  borders: brd,
                  shading: {
                    fill: i % 2 === 0 ? WHITE : LIGHT,
                    type: ShadingType.CLEAR,
                  },
                  width: { size: 4680, type: WidthType.DXA },
                  margins: { ...cm, top: 200, bottom: 200 },
                  children: [
                    para([
                      run(
                        label === "Signature"
                          ? `{{Signature;role=${counterpartyRole}}}`
                          : label === "Date"
                            ? `{{Date;role=${counterpartyRole}}}`
                            : "",
                      ),
                    ]),
                    sp(40),
                    para([run(label, { size: 18, color: GRAY, italic: true })]),
                  ],
                }),
              ],
            }),
        ),
      ],
    });

  const hdr = (docType) =>
    new Header({
      children: [
        new Paragraph({
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: GREEN,
              space: 1,
            },
          },
          spacing: { before: 0, after: 160 },
          children: [
            run("M&M Operations", { bold: true, color: GREEN }),
            run("   |   ", { color: GRAY }),
            run(docType, { color: GRAY }),
          ],
        }),
      ],
    });

  const ftr = () =>
    new Footer({
      children: [
        new Paragraph({
          border: {
            top: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: "E5E7EB",
              space: 1,
            },
          },
          spacing: { before: 120, after: 0 },
          children: [
            run(
              "M&M Operations LLC  |  Atlanta, Georgia  |  ops@motionmethodgroup.com  |  Confidential",
              { size: 18, color: GRAY },
            ),
          ],
        }),
      ],
    });

  const base = (docType) => ({
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: { default: hdr(docType) },
        footers: { default: ftr() },
      },
    ],
  });

  return {
    run,
    bold,
    para,
    sp,
    bul,
    sec,
    notice,
    infoTbl,
    twoColTbl,
    sigBlock,
    base,
    hdr,
    ftr,
    brd,
    cm,
    noBrd,
    GREEN,
    GOLD,
    WHITE,
    GRAY,
    LIGHT,
    BLACK,
    RED,
    LIGHT_RED,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    Paragraph,
    AlignmentType,
    BorderStyle,
    TextRun,
  };
}

async function makeDoc(opts) {
  const { Document, Packer } = await import("docx");
  return Packer.toBlob(new Document(opts));
}

function safeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

function fmt(n) {
  if (!n && n !== 0) return "—";
  return `$${Number(n).toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MSA
// ─────────────────────────────────────────────────────────────────────────────
const MSA_SECTIONS = [
  [
    "1. Parties & Relationship",
    'This Master Services Agreement ("Agreement") is entered into between M&M Operations LLC ("M&M") and the Client identified in any Statement of Work or Event Engagement document issued under this Agreement. This Agreement governs all services provided by M&M to the Client and supersedes any prior oral or written understandings relating to the subject matter herein.',
  ],
  [
    "2. Services",
    'M&M agrees to provide event operations, workforce management, leadership training, infrastructure advisory, and related services as described in individual Statements of Work ("SOW") executed under this Agreement. Each SOW is incorporated by reference. In the event of a conflict, the SOW governs for engagement-specific terms; this Agreement governs for all general terms.',
  ],
  [
    "3. Independent Contractor Status",
    "M&M operates as an independent contractor and not as an employee, partner, joint venturer, or agent of the Client. M&M retains full control over the method and means of performing services within the scope defined by each SOW. Nothing in this Agreement creates an employment relationship between M&M and the Client or between M&M's contractors and the Client.",
  ],
  [
    "4. Payment Terms",
    "4.1 Deposit: All engagements require a deposit as specified in the applicable SOW before work begins. No recruitment, platform configuration, or operational planning commences until the deposit is confirmed cleared. 4.2 Final Balance: The remaining balance is due as specified in the SOW, typically 30 days before the event date. 4.3 Late Payments: Invoices not paid within 15 days of the due date accrue a 1.5% monthly late fee. M&M reserves the right to pause or suspend services for outstanding balances. 4.4 Payment Methods: ACH bank transfer preferred. Wire transfer, check, and Zelle accepted. All payments are in USD.",
  ],
  [
    "5. Labor Reserve",
    "For engagements that include workforce deployment, M&M maintains a Labor Reserve as calculated by M&M's internal pricing engine and documented in the applicable SOW. The Labor Reserve funds contingency bench activation if volunteer show rates fall below projection. Unused reserve is reconciled within 14 days following the event. Fifteen percent (15%) of the Labor Reserve is retained as a risk allocation fee regardless of activation status. The remainder is refunded or credited at the Client's election.",
  ],
  [
    "6. Cancellation & Modification",
    "Cancellation 30+ days before event: 50% of total fees due, deposit non-refundable, Labor Reserve refunded in full. Cancellation 15-29 days before event: 75% of total fees due, deposit non-refundable, Labor Reserve refunded at 50%. Cancellation under 15 days before event: 100% of total fees due, no refunds, Labor Reserve retained in full. Scope Modifications: Any changes to scope, deliverables, or timeline require a written Change Order signed by both parties before M&M implements the change. Verbal approvals are not binding.",
  ],
  [
    "7. Client Responsibilities",
    "The Client agrees to: (a) designate a single point of contact with decision-making authority who is accessible within 48 hours during active engagement; (b) provide venue access, layout, and operational information on agreed timelines; (c) participate in orientations, briefings, and milestone check-ins; (d) support volunteer recruitment through their own community channels; and (e) provide timely payment per the fee schedule. Failure to meet these obligations may affect M&M's execution quality and does not constitute grounds for fee reduction or scope dispute.",
  ],
  [
    "8. Axis Platform",
    "Where Axis platform services are included in this engagement: (a) access is provisioned by M&M for the duration of the engagement only; (b) access does not continue beyond the engagement term without a separate retainer agreement; (c) Client data captured within Axis remains the property of the Client; (d) M&M uses aggregate platform data to improve system recommendations — individual Client data is not shared externally; and (e) M&M is not liable for third-party platform downtime.",
  ],
  [
    "9. Confidentiality",
    "Both parties agree to maintain the confidentiality of proprietary information shared during this engagement. M&M's pricing methodology, scoring models (VRI, WRR, CIMI), and internal systems are proprietary IP and remain the sole property of M&M Operations. Client event data, volunteer data, and operational information are confidential and will not be shared by M&M externally. This obligation survives termination of this Agreement for three (3) years.",
  ],
  [
    "10. Intellectual Property",
    "All work product and materials created by M&M in connection with Client engagements are, upon full payment, licensed to the Client for their internal operational use. M&M retains ownership of its proprietary methodologies, scoring frameworks, platform architecture, and tools. Client may not reproduce, resell, or distribute M&M's methodologies or frameworks without written consent.",
  ],
  [
    "11. Non-Solicitation",
    "During the term of this Agreement and for twelve (12) months following its conclusion, the Client agrees not to directly solicit, hire, or engage any M&M contractor, employee, or team member introduced to the Client through M&M, without M&M's prior written consent. A placement fee of 20% of first-year compensation applies to any such hire made without consent.",
  ],
  [
    "12. Limitation of Liability",
    "M&M's total liability under this Agreement shall not exceed the total fees paid by the Client for the engagement in which the claim arises. M&M is not liable for specific volunteer show rates, event outcomes, revenue results, force majeure events, or third-party platform failures outside M&M's control.",
  ],
  [
    "13. Governing Law",
    "This Agreement is governed by the laws of the State of Georgia. Disputes shall first be addressed through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration in Atlanta, Georgia under AAA rules.",
  ],
  [
    "14. Entire Agreement",
    "This Agreement, together with any SOWs and Change Orders, constitutes the entire agreement between the parties and supersedes all prior discussions. This Agreement may only be modified by a written amendment signed by both parties.",
  ],
  [
    "15. Severability",
    "If any provision of this Agreement is found to be unenforceable, the remaining provisions continue in full force and effect.",
  ],
];

export async function generateMSA({ client, event, operator, today }) {
  const H = await h();
  const opts = H.base("Master Services Agreement");
  opts.sections[0].children = [
    H.sp(200),
    H.para([H.bold("MASTER SERVICES AGREEMENT", { size: 36, color: H.GREEN })]),
    H.sp(40),
    H.para([
      H.run("Motion & Method Operations LLC", {
        size: 24,
        color: H.GOLD,
        bold: true,
      }),
    ]),
    H.para([H.run(`Prepared for ${client}`, { color: H.GRAY })]),
    H.sp(120),
    H.infoTbl([
      ["M&M Operations LLC", "Atlanta, Georgia  |  ops@motionmethodgroup.com"],
      ["Client Name", client],
      ["Event", event?.name || ""],
      ["Effective Date", today],
      ["Authorized Signatory", operator],
      ["Governing Law", "State of Georgia, United States"],
    ]),
    H.sp(160),
    H.notice(
      "This Master Services Agreement governs all services provided by M&M Operations LLC to the Client identified above. By signing this Agreement or any Statement of Work referencing it, both parties agree to be bound by these terms.",
    ),
    H.sp(200),
    ...MSA_SECTIONS.flatMap(([title, content]) => [
      H.sec(title),
      H.para([H.run(content)]),
      H.sp(80),
    ]),
    H.sp(200),
    H.notice(
      "This is a legally binding document. Read it in full before signing. M&M recommends independent legal review before execution.",
      "FFF8E7",
      "#8a6800",
      H.GOLD,
    ),
    H.sp(200),
    H.sec("SIGNATURES"),
    H.sp(80),
    H.para([
      H.run(
        "By signing below, both parties confirm they have read, understood, and agree to the terms of this Master Services Agreement.",
      ),
    ]),
    H.sp(160),
    H.sigBlock(operator),
    H.sp(200),
  ];
  const blob = await makeDoc(opts);
  const filename = safeFilename(
    `MM_MSA_${client}_${new Date().toISOString().slice(0, 10)}.docx`,
  );
  return { blob, filename };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSAL
// ─────────────────────────────────────────────────────────────────────────────
export async function generateProposal({
  client,
  event,
  pricingLog,
  operator,
  form,
  today,
}) {
  const H = await h();

  const tier = pricingLog?.tier || "";
  const vri = pricingLog?.vri_band || "";
  const wrr = pricingLog?.wrr_band || "";
  const cimiAvg = pricingLog?.cimi_avg || "";
  const pillar = pricingLog?.pillar || event?.pillar || "";
  const clientTotal = pricingLog?.client_total || pricingLog?.final_price || "";
  const reserve = pricingLog?.reserve_amount || 0;
  const gross = pricingLog?.gross_engagement_value || "";
  const addOns = pricingLog?.add_on_total || 0;
  const escalator =
    pricingLog?.escalator_mult > 1
      ? `x${Number(pricingLog.escalator_mult).toFixed(2)}`
      : "x1.00";
  const attendees = event?.attendee_count || "";
  const deposit = form.depositPct || "50%";
  const depositAmt =
    form.depositAmount ||
    (clientTotal
      ? `$${Math.round(Number(clientTotal) * 0.5).toLocaleString()}`
      : "");

  const getCimiLabel = (avg) => {
    if (!avg) return "Not assessed";
    const n = parseFloat(avg);
    if (n < 2.4) return "Foundational";
    if (n < 3.5) return "Structural Gaps Present";
    if (n < 4.5) return "Maturing";
    return "Embedded Partner";
  };

  const opts = H.base("Engagement Proposal");
  opts.sections[0].children = [
    H.sp(200),
    H.para([H.bold("ENGAGEMENT PROPOSAL", { size: 36, color: H.GREEN })]),
    H.sp(40),
    H.para([
      H.run(`Prepared for ${client}`, { size: 24, bold: true, color: H.GOLD }),
    ]),
    H.para([H.run(`${event?.name || ""}  |  ${today}`, { color: H.GRAY })]),
    H.sp(80),
    H.notice(
      "This proposal is confidential and prepared exclusively for the named recipient. Valid for 14 days from issue date.",
    ),
    H.sp(160),

    H.sec("1. YOUR ENVIRONMENT"),
    H.para([
      H.run(
        "Based on our discovery conversation and intake assessment, here is what we understand about your operational environment.",
      ),
    ]),
    H.sp(80),
    H.infoTbl([
      ["Organization", client],
      [
        "Event Name & Date",
        `${event?.name || ""} — ${event?.event_date || "TBD"}`,
      ],
      [
        "Event Scale",
        attendees
          ? `${Number(attendees).toLocaleString()} projected attendees — ${tier}`
          : tier,
      ],
      [
        "Operational Maturity",
        cimiAvg ? `${cimiAvg} — ${getCimiLabel(cimiAvg)}` : "Not assessed",
      ],
      ["Volunteer Risk (VRI)", vri || "To be assessed"],
      ["Workforce Risk (WRR)", wrr || "To be assessed"],
      ["Key Challenge", form.keyChallenge || ""],
      ["What Success Looks Like", form.successDef || ""],
    ]),
    H.sp(160),

    H.sec("2. RECOMMENDED ENGAGEMENT"),
    H.para([
      H.run(
        `Based on your environment, we are recommending the following engagement structure.`,
      ),
    ]),
    H.sp(80),
    H.infoTbl([
      ["Primary Pillar(s)", pillar || "Pillar 1 — Execution"],
      ["Engagement Tier", tier],
      ["Rationale", form.engagementRationale || ""],
    ]),
    H.sp(160),

    H.sec("3. WHAT WE WILL DO"),
    H.para([
      H.run(
        "The following services are included in this engagement. Everything not listed below is explicitly out of scope.",
      ),
    ]),
    H.sp(80),
    H.para([H.bold("Pillar 1 — Event Execution", { color: H.GREEN })]),
    H.sp(40),
    ...[
      "Volunteer recruitment, screening, and onboarding against your event profile",
      "Orientation program — virtual and in-person — built around your event and brand",
      "Day-of floor management and operational command via Axis platform",
      "Team Lead and Ops Lead deployment, briefing, and real-time oversight",
      "Contingency bench activation based on your Labor Reserve level",
      "Incident documentation and post-event performance reports",
    ].map((item) => H.bul(item)),
    H.sp(120),
    H.para([H.bold("Explicitly Out of Scope", { color: H.RED })]),
    H.sp(40),
    ...[
      "Budget ownership or vendor payment authority",
      "Vendor sourcing or contracting",
      "Event programming or speaker management",
      "Security, medical, or emergency services staffing",
      "Any service not listed above — scope additions require a signed Change Order",
    ].map((item) => H.bul(item, H.RED)),
    H.sp(160),

    H.sec("4. YOUR WORKFORCE MODEL"),
    H.para([
      H.run(
        "M&M builds and operates a three-layer workforce structure. Every layer has defined authority, defined escalation, and defined accountability.",
      ),
    ]),
    H.sp(80),
    H.twoColTbl(
      ["Layer", "Role", "Authority", "Target (This Event)"],
      [
        [
          "Layer 1",
          "General Volunteer",
          "Executes assigned role. Flexible deployment.",
          attendees ? `${Math.ceil(Number(attendees) / 75)} target` : "TBD",
        ],
        [
          "Layer 2",
          "Team Lead",
          "Floor management. Volunteer oversight.",
          "1 TL per 10 volunteers",
        ],
        [
          "Layer 2",
          "Ops Lead",
          "Zone command. Cross-floor coordination.",
          attendees ? `${Math.ceil(Number(attendees) / 300)} Ops Leads` : "TBD",
        ],
        [
          "Layer 3",
          "M&M Senior Ops",
          "Operational command when Founders unavailable.",
          "1 per engagement",
        ],
        [
          "Layer 3",
          "M&M Founder / EL",
          "Strategic oversight. Client relationship. Final authority.",
          "1-2 per engagement",
        ],
      ],
      [1080, 2160, 3600, 2520],
    ),
    H.sp(160),

    H.sec("5. INVESTMENT"),
    H.para([
      H.run(
        "Every line item is calculated from M&M's internal pricing engine based on your event's complexity, risk profile, and scope.",
      ),
    ]),
    H.sp(80),
    H.twoColTbl(
      ["Component", "Amount"],
      [
        [
          "Base Engagement Fee (Tier Adjusted)",
          clientTotal ? fmt(clientTotal) : "See pricing engine",
        ],
        ["Add-Ons", addOns > 0 ? fmt(addOns) : "None"],
        ["Risk Escalators", escalator],
        ["Service Fees Subtotal", clientTotal ? fmt(clientTotal) : ""],
        ["Labor Reserve (Risk Protection)", reserve > 0 ? fmt(reserve) : "$0"],
        [
          "Total Engagement Investment",
          gross ? fmt(gross) : clientTotal ? fmt(clientTotal) : "TBD",
        ],
      ],
      [4680, 4680],
    ),
    H.sp(80),
    H.twoColTbl(
      ["Payment Schedule", "Amount / Timing"],
      [
        [
          "Deposit (due at signing)",
          depositAmt
            ? `${depositAmt} — engagement activates upon clearance`
            : `${deposit} of Total Investment`,
        ],
        [
          "Final Balance",
          form.finalBalance ||
            `Due ${form.balanceDueDays || "30"} days before event date`,
        ],
        [
          "Labor Reserve Reconciliation",
          "Unused reserve returned post-event. 15% retained as risk allocation fee.",
        ],
      ],
      [4680, 4680],
    ),
    H.sp(80),
    H.notice(
      "On the Labor Reserve: The labor reserve is not a fee — it is a protection mechanism. It funds contingency bench activation if volunteer show rates fall below projection. Unused reserve is reconciled within 14 days of the event.",
    ),
    H.sp(160),

    H.sec("6. WHAT WE NEED FROM YOU"),
    ...[
      "A single point of contact with decision-making authority — accessible within 48 hours during active engagement",
      "Venue access, layout, and event logistics information on agreed timelines",
      "Active participation in orientations, briefings, and milestone check-ins",
      "Support for volunteer recruitment through your own community channels",
      "Timely payment per the fee schedule — no work activates without confirmed deposit",
      "Advance notice of any event changes, additions, or constraints as soon as they are known",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("7. NEXT STEPS"),
    H.para([
      H.run(
        "This proposal is valid for 14 days from the issue date. To move forward:",
      ),
    ]),
    H.sp(80),
    ...[
      "Confirm the engagement structure and any scope questions",
      "Review and execute the Statement of Work (issued separately upon acceptance)",
      "Submit the deposit — engagement activates upon confirmed clearance",
      "Schedule your kickoff — Axis goes live, recruitment opens, the system starts moving",
    ].map((item, i) => H.bul(`Step ${i + 1}: ${item}`)),
    H.sp(80),
    H.para([
      H.run(`M&M Primary Contact: ${operator}  |  ops@motionmethodgroup.com`, {
        color: H.GRAY,
      }),
    ]),
    H.sp(160),

    H.notice(
      "This proposal is valid for 14 days. Pricing and availability are subject to change after that window.",
      "FFF8E7",
      "#8a6800",
      H.GOLD,
    ),
    H.sp(200),
    H.sec("ACCEPTANCE"),
    H.sp(80),
    H.para([
      H.run(
        "By signing below, the Client confirms they have reviewed this proposal and wish to proceed with the engagement as described.",
      ),
    ]),
    H.sp(160),
    H.sigBlock(operator),
    H.sp(200),
  ];

  const blob = await makeDoc(opts);
  const filename = safeFilename(
    `MM_Proposal_${client}_${event?.name || ""}_${new Date().toISOString().slice(0, 10)}.docx`,
  );
  return { blob, filename };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOW
// ─────────────────────────────────────────────────────────────────────────────
export async function generateSOW({
  client,
  event,
  pricingLog,
  operator,
  form,
  today,
}) {
  const H = await h();

  const tier = pricingLog?.tier || "";
  const vri = pricingLog?.vri_band || "";
  const wrr = pricingLog?.wrr_band || "";
  const pillar = pricingLog?.pillar || event?.pillar || "P1";
  const clientTotal = pricingLog?.client_total || pricingLog?.final_price || "";
  const reserve = pricingLog?.reserve_amount || 0;
  const gross = pricingLog?.gross_engagement_value || clientTotal || "";
  const attendees = event?.attendee_count || "";
  const deposit = form.depositPct || "50%";
  const depositAmt =
    form.depositAmount ||
    (clientTotal
      ? `$${Math.round(Number(clientTotal) * 0.5).toLocaleString()}`
      : "");

  const opts = H.base("Statement of Work");
  opts.sections[0].children = [
    H.sp(200),
    H.para([H.bold("STATEMENT OF WORK", { size: 36, color: H.GREEN })]),
    H.sp(40),
    H.para([
      H.run(`${client}  |  ${event?.name || ""}`, {
        size: 24,
        bold: true,
        color: H.GOLD,
      }),
    ]),
    H.para([
      H.run(
        "Issued under Master Services Agreement  |  M&M Operations  |  v1.0",
        { color: H.GRAY },
      ),
    ]),
    H.sp(160),

    H.sec("1. PARTIES & ENGAGEMENT OVERVIEW"),
    H.infoTbl([
      ["Client Organization", client],
      ["Client Primary Contact", form.clientContact || ""],
      ["Client Email", form.clientEmail || ""],
      ["M&M Engagement Lead", operator],
      ["SOW Issue Date", today],
      ["MSA Reference Date", form.msaRef || "Standalone SOW"],
      ["Engagement Pillar(s)", pillar],
      ["Engagement Tier", tier],
    ]),
    H.sp(160),

    H.sec("2. EVENT DETAILS"),
    H.infoTbl([
      ["Event Name", event?.name || ""],
      ["Event Date(s)", event?.event_date || "TBD"],
      ["Event Location(s)", event?.venue || event?.location || "TBD"],
      [
        "Estimated Peak Attendance",
        attendees ? Number(attendees).toLocaleString() : "TBD",
      ],
      [
        "Volunteer Headcount Target",
        attendees
          ? `${Math.ceil(Number(attendees) / 75)} (industry standard 1:75 ratio)`
          : "TBD",
      ],
      ["Event Tier", tier],
      ["VRI Band", vri || "To be assessed"],
      ["WRR Band", wrr || "To be assessed"],
    ]),
    H.sp(80),
    H.notice(
      "The Volunteer Risk Index (VRI) and Workforce Reliability Risk (WRR) scores are the basis for labor reserve requirements and contingency planning. Both scores are documented in M&M's internal pricing engine and are available to the Client upon request.",
    ),
    H.sp(160),

    H.sec("3. SCOPE OF SERVICES"),
    H.para([
      H.run(
        "M&M will provide the following services under this SOW. Any service not listed below is explicitly out of scope.",
      ),
    ]),
    H.sp(80),
    H.para([H.bold("Pillar 1 — Event Execution", { color: H.GREEN })]),
    H.sp(40),
    ...[
      "Volunteer recruitment, screening, and onboarding",
      "Volunteer orientation (virtual and/or in-person)",
      "Day-of floor management and operational command",
      "Volunteer check-in/out via Axis platform",
      "Team Lead and Ops Lead deployment and oversight",
      "Incident documentation and real-time reporting via Axis",
      "Contingency bench activation (per Labor Reserve and WRR band)",
      "Post-event debrief and Axis performance reports",
    ].map((item) => H.bul(item)),
    ...(form.scopeNotes?.trim()
      ? [
          H.para([
            H.bold("Engagement-Specific Scope Notes", { color: H.GREEN }),
          ]),
          H.sp(40),
          H.para([H.run(form.scopeNotes.trim())]),
          H.sp(40),
          H.notice(
            "The scope notes above document engagement-specific arrangements confirmed between M&M and the Client. They supplement but do not replace the standard scope defined above.",
            "EFF6FF",
            H.GREEN,
            H.GREEN,
          ),
          H.sp(80),
        ]
      : [H.sp(80)]),
    H.sp(160),

    H.sec("4. EXPLICIT EXCLUSIONS"),
    H.para([
      H.run(
        "The following are explicitly out of scope unless added via a signed Change Order. M&M is not responsible for any item below regardless of client expectation or assumption.",
      ),
    ]),
    H.sp(80),
    ...[
      "Budget ownership, financial management, or vendor payment authority",
      "Vendor sourcing, contracting, or management",
      "Event programming, content, or speaker management",
      "Security, medical, or emergency services staffing",
      "Media, press, or public relations management",
      "Legal or compliance representation",
      "Catering or hospitality staffing (unless explicitly scoped)",
      "Any service not listed in Section 3 above",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("5. CLIENT RESPONSIBILITIES"),
    ...[
      "Provide venue access, layout, and operational information on agreed timelines",
      "Designate a single point of contact with decision-making authority",
      "Respond to M&M requests and approvals within 48 hours during active engagement",
      "Provide timely payment per the fee schedule in Section 6",
      "Ensure volunteer participation targets are supported through client's own community channels",
      "Communicate event changes, additions, or cancellations with minimum notice per Section 8",
      "Ensure all venue and event logistics (permits, access, load-in) are arranged independently",
      "Participate in orientation sessions and pre-event briefings as requested by M&M",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("6. FEES & PAYMENT"),
    H.twoColTbl(
      ["Fee Component", "Amount"],
      [
        [
          "Base Engagement Fee (Tier Adjusted)",
          clientTotal ? fmt(clientTotal) : "Per Pricing Engine",
        ],
        [
          "Add-Ons",
          pricingLog?.add_on_total > 0 ? fmt(pricingLog.add_on_total) : "None",
        ],
        [
          "Escalators Applied",
          pricingLog?.escalator_mult > 1
            ? `x${Number(pricingLog.escalator_mult).toFixed(2)}`
            : "x1.00",
        ],
        ["Service Fees Subtotal", clientTotal ? fmt(clientTotal) : ""],
        ["Labor Reserve (Risk Protection)", reserve > 0 ? fmt(reserve) : "$0"],
        [
          "Total Project Investment",
          gross ? fmt(gross) : clientTotal ? fmt(clientTotal) : "TBD",
        ],
      ],
      [5040, 4320],
    ),
    H.sp(80),
    H.twoColTbl(
      ["Payment Schedule", "Details"],
      [
        [
          "Deposit (due at signing)",
          depositAmt
            ? `${depositAmt} (${deposit} of Total Project Investment)`
            : `${deposit} of Total Project Investment`,
        ],
        [
          "Final Balance",
          `Due ${form.balanceDueDays || "30"} days before event date`,
        ],
        [
          "Labor Reserve Reconciliation",
          "Unused reserve reconciled within 14 days post-event. 15% of reserve retained as risk allocation fee.",
        ],
      ],
      [3600, 5760],
    ),
    H.sp(80),
    H.notice(
      "No work begins — including recruitment, Axis configuration, or system design — until the deposit is received and confirmed cleared. M&M reserves the right to release any reserved capacity if deposit is not received within 5 business days of SOW execution.",
    ),
    H.sp(160),

    H.sec("7. TIMELINE & MILESTONES"),
    H.twoColTbl(
      ["Milestone", "Target Date", "Owner"],
      [
        ["SOW executed & deposit received", "", "Client + M&M"],
        ["Engagement activation — Axis + workspace live", "", "M&M"],
        ["Volunteer recruitment opens", "", "M&M"],
        ["Virtual orientations complete", "", "M&M"],
        ["Team Lead assignments confirmed", "", "M&M"],
        ["Final ops briefing delivered to Client", "", "M&M"],
        ["In-person orientation & venue walkthrough", "", "M&M + Client"],
        ["Volunteer headcount locked", "", "M&M"],
        ["Event Day — Go / No-Go check", event?.event_date || "", "M&M"],
        ["Post-event debrief delivered", "Within 7 days post-event", "M&M"],
        ["Labor Reserve reconciliation", "Within 14 days post-event", "M&M"],
      ],
      [4320, 2880, 2160],
    ),
    H.sp(160),

    H.sec("8. CANCELLATION & MODIFICATION POLICY"),
    H.twoColTbl(
      ["Condition", "Policy"],
      [
        [
          "Cancellation — 30+ days before event",
          "50% of total fees due. Deposit non-refundable. Labor Reserve refunded in full.",
        ],
        [
          "Cancellation — 15-29 days before event",
          "75% of total fees due. Deposit non-refundable. Labor Reserve refunded at 50%.",
        ],
        [
          "Cancellation — Under 15 days before event",
          "100% of total fees due. No refunds. Labor Reserve retained in full.",
        ],
        [
          "Scope reduction — 15+ days before event",
          "Fees adjusted per Change Order. Deposit non-refundable.",
        ],
        [
          "Scope reduction — Under 15 days",
          "No fee reduction. M&M has committed resources that cannot be redeployed.",
        ],
        [
          "Event postponement",
          "Treated as cancellation and re-booking. New SOW required. Deposit credited if within 90 days.",
        ],
      ],
      [3600, 5760],
    ),
    H.sp(160),

    H.sec("9. AXIS PLATFORM ACCESS"),
    ...[
      "Axis access is provisioned by M&M and is active for the duration of this engagement only",
      "Access does not continue beyond the engagement term without a separate retainer agreement",
      "Client data captured within Axis remains the property of the Client within their workspace",
      "M&M uses aggregate platform data to improve system recommendations — individual client data is not shared externally",
      "M&M is not liable for third-party platform downtime. Fallback communication protocols are defined in the Chain of Command document",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("10. CONFIDENTIALITY & INTELLECTUAL PROPERTY"),
    ...[
      "M&M's pricing methodology, scoring models (VRI, WRR, CIMI), and internal systems are proprietary IP and remain the sole property of M&M Operations",
      "Client deliverables are licensed to the Client for their internal operational use — they are not to be reproduced, resold, or distributed without M&M's written consent",
      "Client's event data, volunteer data, and operational information are confidential and will not be shared by M&M externally",
      "Both parties agree not to solicit or hire each other's employees or contractors during the engagement and for 12 months following its conclusion",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("11. LIMITATION OF LIABILITY"),
    ...[
      "M&M does not guarantee specific volunteer show rates. Show rate projections are based on VRI scoring and historical data — actual results may vary",
      "M&M's liability under this SOW is limited to the total fees paid by the Client for the engagement",
      "M&M is not liable for event outcomes, revenue results, or client decisions made outside the scope of this engagement",
      "Force majeure events — including weather, venue failure, or public safety emergencies — are outside M&M's control and liability",
    ].map((item) => H.bul(item)),
    H.sp(200),

    H.sec("12. AUTHORIZATION & SIGNATURES"),
    H.para([
      H.run(
        "By signing below, both parties confirm they have read, understood, and agree to the terms of this Statement of Work.",
      ),
    ]),
    H.sp(80),
    H.notice(
      "SOWs up to $20,000 may be signed by Senior Ops with Founder review. SOWs above $20,000 require Founder signature.",
    ),
    H.sp(160),
    H.sigBlock(operator, "Authorized Signatory, M&M Operations LLC"),
    H.sp(200),
  ];

  const blob = await makeDoc(opts);
  const filename = safeFilename(
    `MM_SOW_${client}_${event?.name || ""}_${new Date().toISOString().slice(0, 10)}.docx`,
  );
  return { blob, filename };
}

// ─────────────────────────────────────────────────────────────────────────────
// IC AGREEMENT
// ─────────────────────────────────────────────────────────────────────────────
export async function generateICAgreement({ contractorName, operator, today }) {
  const H = await h();

  const opts = H.base("Independent Contractor Agreement");
  opts.sections[0].children = [
    H.sp(200),
    H.para([
      H.bold("INDEPENDENT CONTRACTOR AGREEMENT", { size: 36, color: H.GREEN }),
    ]),
    H.sp(40),
    H.para([H.run(contractorName, { size: 24, bold: true, color: H.GOLD })]),
    H.para([
      H.run(`Effective Date: ${today}  |  M&M Operations  |  v1.0`, {
        color: H.GRAY,
      }),
    ]),
    H.sp(80),
    H.notice(
      "This Agreement is confidential and governs the working relationship between M&M Operations and the Contractor named above.",
    ),
    H.sp(160),

    H.sec("PARTIES TO THIS AGREEMENT"),
    H.infoTbl([
      ["Company", "M&M Operations LLC  |  Atlanta, Georgia"],
      ["Contractor Legal Name", contractorName],
      ["Effective Date", today],
      ["Authorized Signatory (M&M)", operator],
    ]),
    H.sp(160),

    H.sec("1. ENGAGEMENT & SCOPE OF SERVICES"),
    H.para([
      H.run(
        'Contractor agrees to provide event-based operational services as outlined in individual Event Engagement Addendums ("Addendums") issued by M&M for each engagement. Each Addendum specifies the event, role, shift schedule, compensation, and any engagement-specific requirements.',
      ),
    ]),
    H.sp(80),
    H.para([
      H.run(
        "Contractor's role within any engagement is determined by M&M based on event complexity, Contractor's performance history, and operational need. Role assignments are documented in the applicable Addendum and in the Axis platform.",
      ),
    ]),
    H.sp(80),
    H.para([
      H.run(
        "Contractor understands that M&M operates a workforce progression model. Initial engagements establish baseline performance data. Future role assignments, advancement, and contractor rate adjustments are determined by performance documentation and M&M's discretion.",
      ),
    ]),
    H.sp(160),

    H.sec("2. INDEPENDENT CONTRACTOR STATUS"),
    H.para([
      H.run(
        "Contractor is an independent contractor and not an employee, partner, joint venturer, or agent of M&M Operations. Nothing in this Agreement creates an employment relationship.",
      ),
    ]),
    H.sp(80),
    ...[
      "Contractor retains control over the method and means of performing services within the scope defined by M&M",
      "Contractor is solely responsible for all federal, state, and local taxes on compensation received under this Agreement",
      "Contractor is not entitled to employee benefits including health insurance, retirement plans, paid time off, or workers' compensation",
      "Contractor is free to provide services to other clients provided they do not conflict with M&M engagements or violate any provision of this Agreement",
      "M&M will issue a Form 1099 to Contractors earning $600 or more in a calendar year",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("3. BACKGROUND CHECK REQUIREMENT"),
    H.para([
      H.run(
        "As a condition of engagement with M&M Operations, all contractors are required to consent to and successfully complete a background check prior to their first active deployment. Background checks are conducted through M&M's approved screening provider. M&M reserves the right to deny or suspend engagement based on background check results at its sole discretion.",
      ),
    ]),
    H.sp(80),
    H.notice(
      "Background checks are non-negotiable. M&M places contractors in environments with high public visibility, VIP access, and sensitive operational responsibilities. Our clients trust us with their events. We protect that trust by knowing who is on our team.",
    ),
    H.sp(160),

    H.sec("4. COMPENSATION"),
    H.para([
      H.run(
        "Compensation for each engagement is defined in the applicable Event Engagement Addendum. No compensation is owed for services not covered by an executed Addendum.",
      ),
    ]),
    H.sp(80),
    ...[
      "Payment is issued via direct deposit within Net 14 days of event completion unless otherwise specified in the Addendum",
      "M&M reserves the right to withhold payment pending completion of post-event documentation requirements including Axis check-out and incident reporting",
      "Disputed payments must be raised in writing within 7 days of the payment date",
      "Contractor rate adjustments are made at M&M's discretion based on performance, role advancement, and market conditions",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("5. SCOPE OF AUTHORITY"),
    H.para([
      H.run(
        "Contractor's authority is limited to the operational scope defined in their role assignment and Addendum. No contractor has authority to bind M&M Operations beyond their assigned floor responsibilities.",
      ),
    ]),
    H.sp(80),
    H.para([H.bold("Contractor MAY:", { color: H.GREEN })]),
    H.sp(40),
    ...[
      "Perform services within the scope and role defined in the Addendum",
      "Make tactical decisions within their assigned authority level (Team Lead, Ops Lead, etc.)",
      "Communicate with event staff and volunteers within their chain of command",
      "Document incidents and decisions in the Axis platform as required",
    ].map((item) => H.bul(item)),
    H.sp(80),
    H.para([H.bold("Contractor MAY NOT:", { color: H.RED })]),
    H.sp(40),
    ...[
      "Bind M&M to any new agreements, commitments, or financial obligations",
      "Modify pricing, scope, or deliverables with any client or third party",
      "Represent ownership, partnership, or management authority in M&M",
      "Make promises of additional services or deliverables beyond their Addendum",
      "Communicate publicly on behalf of M&M including media, press, or social media",
      "Sign any document on behalf of M&M Operations",
    ].map((item) => H.bul(item, H.RED)),
    H.sp(160),

    H.sec("6. AXIS PLATFORM USAGE"),
    H.para([
      H.run(
        "All active M&M contractors are required to use the Axis platform for check-in, check-out, incident reporting, scheduling, and engagement communication during M&M events. Access is provisioned by M&M for each engagement.",
      ),
    ]),
    H.sp(80),
    H.para([
      H.run(
        "Axis access is tied to the active engagement only. Access does not persist beyond the engagement term without M&M authorization. Contractor data within Axis is visible to M&M engagement leads and is used for performance documentation and progression scoring.",
      ),
    ]),
    H.sp(80),
    H.para([
      H.run(
        "Contractor agrees to use Axis as directed, maintain accurate records, and not share access credentials with any third party.",
      ),
    ]),
    H.sp(160),

    H.sec("7. CONFIDENTIALITY"),
    ...[
      "M&M's pricing methodology, scoring models (VRI, WRR, CIMI), and internal operating systems are proprietary IP and must not be disclosed, replicated, or shared",
      "Client identities, event details, and operational information are confidential and must not be discussed publicly or with third parties",
      "Contractor's Axis profile data, performance scores, and progression records are internal to M&M and are not to be shared",
      "Contractor may not use any M&M client relationship to solicit independent business from that client during or for 12 months following any M&M engagement involving that client",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("8. INTELLECTUAL PROPERTY"),
    H.para([
      H.run(
        "All work product, systems, documentation, and materials created by Contractor in connection with M&M engagements are the sole property of M&M Operations. Contractor assigns all rights, title, and interest in such work product to M&M upon creation. This includes event documentation, incident reports, volunteer management materials, training materials developed under M&M direction, and any work product created using M&M's systems, templates, or methodologies.",
      ),
    ]),
    H.sp(160),

    H.sec("9. NON-SOLICITATION"),
    H.para([
      H.run(
        "During the term of this Agreement and for twelve (12) months following its conclusion, Contractor agrees not to:",
      ),
    ]),
    H.sp(80),
    ...[
      "Directly solicit or accept independent event operations work from any client or partner that Contractor was introduced to through M&M",
      "Recruit, solicit, or encourage any M&M contractor, employee, or team member to leave M&M or join a competing venture",
      "Use M&M's client relationships, operational methodologies, or proprietary systems to establish or support a competing service",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("10. TERMINATION"),
    H.para([
      H.run(
        "Either party may terminate this Agreement with written notice. The following termination conditions apply:",
      ),
    ]),
    H.sp(80),
    ...[
      "Convenience: Either party may terminate with 7 days written notice. Compensation is owed for work completed prior to termination.",
      "For Cause — by M&M: M&M may terminate immediately for violation of confidentiality, failure to pass background check, misconduct during an engagement, or repeated performance failures documented in Axis.",
      "For Cause — by Contractor: Contractor may terminate immediately if M&M materially breaches payment obligations and fails to cure within 7 days of written notice.",
      "Post-Termination: Sections 7 (Confidentiality), 8 (IP), and 9 (Non-Solicitation) survive termination of this Agreement.",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("11. GENERAL PROVISIONS"),
    ...[
      "Governing Law: This Agreement is governed by the laws of the State of Georgia.",
      "Entire Agreement: This Agreement, together with applicable Event Engagement Addendums, constitutes the entire agreement between the parties.",
      "Amendment: This Agreement may only be modified by a written amendment signed by both parties.",
      "Severability: If any provision is found unenforceable, the remaining provisions continue in full force.",
    ].map((item) => H.bul(item)),
    H.sp(200),

    H.notice(
      "Before Signing: Contractor must have completed or scheduled the required background check before this Agreement is executed.",
      H.LIGHT_RED,
      H.RED,
      H.RED,
    ),
    H.sp(160),

    H.sec("SIGNATURES"),
    H.para([
      H.run(
        "By signing below, both parties confirm they have read, understood, and agree to the terms of this Independent Contractor Agreement.",
      ),
    ]),
    H.sp(160),
    H.sigBlock(
      operator,
      "Managing Director  |  M&M Operations LLC",
      "Contractor",
    ),
    H.sp(200),
  ];

  const blob = await makeDoc(opts);
  const filename = safeFilename(
    `MM_ICA_${contractorName}_${new Date().toISOString().slice(0, 10)}.docx`,
  );
  return { blob, filename };
}

// ─────────────────────────────────────────────────────────────────────────────
// THIRD-PARTY STAFFING WAIVER
// ─────────────────────────────────────────────────────────────────────────────
export async function generateWaiver({ client, event, operator, today }) {
  const H = await h();

  const opts = H.base("Third-Party Staffing Waiver");
  opts.sections[0].children = [
    H.sp(200),
    H.para([
      H.bold("THIRD-PARTY STAFFING WAIVER", { size: 36, color: H.GREEN }),
    ]),
    H.sp(40),
    H.para([
      H.run(`${client}  |  ${event?.name || ""}`, {
        size: 24,
        bold: true,
        color: H.GOLD,
      }),
    ]),
    H.para([H.run(`Issued by M&M Operations  |  ${today}`, { color: H.GRAY })]),
    H.sp(160),

    H.notice(
      "This waiver formally documents that the Client has elected to source workforce independently for this engagement. M&M's scope, liability, and performance guarantees are explicitly limited to the services described in the applicable Statement of Work.",
    ),
    H.sp(160),

    H.sec("1. BACKGROUND"),
    H.infoTbl([
      ["Client Organization", client],
      ["Event Name", event?.name || ""],
      ["Event Date(s)", event?.event_date || "TBD"],
      ["Event Location", event?.venue || event?.location || "TBD"],
      ["M&M Engagement Lead", operator],
      ["Waiver Issue Date", today],
    ]),
    H.sp(160),

    H.sec("2. STAFFING SCOPE EXCLUSION"),
    H.para([
      H.run(
        "The Client has elected to source, manage, and deploy workforce independently for this engagement. As a result, the following applies:",
      ),
    ]),
    H.sp(80),
    ...[
      "M&M's Labor Reserve has been removed from the engagement pricing. M&M bears no financial obligation for workforce contingency on independently sourced staff.",
      "M&M's workforce management services (recruitment, screening, onboarding, orientation, and contingency bench) are explicitly out of scope for independently sourced staff.",
      "M&M's Axis platform access, check-in/check-out systems, and performance documentation are available only for M&M-managed roles as defined in the applicable SOW.",
      "Any independently sourced staff are not under M&M's management, training, or quality assurance framework.",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("3. LIABILITY EXCLUSION"),
    H.para([
      H.run(
        "By executing this waiver, the Client expressly acknowledges and agrees to the following:",
      ),
    ]),
    H.sp(80),
    ...[
      "M&M Operations is not liable for the performance, conduct, reliability, or outcomes attributable to any workforce sourced independently by the Client.",
      "Operational failures, coverage gaps, safety incidents, or event-day disruptions caused by or attributable to independently sourced staff are not the responsibility of M&M Operations.",
      "M&M's total liability for this engagement remains limited to the services and roles explicitly defined in the applicable Statement of Work.",
      "The Client assumes full operational and legal responsibility for independently sourced staff, including but not limited to compliance with applicable employment and labor laws.",
    ].map((item) => H.bul(item)),
    H.sp(80),
    H.notice(
      "This is not accountability dodging — it is honest scope definition. M&M can only be held to the standard of what M&M manages. Workforce sourced outside M&M's framework operates outside M&M's quality controls.",
      "FFF8E7",
      "#8a6800",
      H.GOLD,
    ),
    H.sp(160),

    H.sec("4. M&M RETAINED SCOPE"),
    H.para([
      H.run(
        "Notwithstanding the staffing scope exclusion, M&M retains the following responsibilities as defined in the applicable Statement of Work:",
      ),
    ]),
    H.sp(80),
    ...[
      "Management, oversight, and accountability for M&M-sourced and M&M-managed roles only",
      "Operational command structure and chain of command for M&M-managed staff",
      "Incident documentation and reporting for events occurring within M&M-managed zones",
      "Post-event debrief and performance reporting scoped to M&M-managed operations",
    ].map((item) => H.bul(item)),
    H.sp(160),

    H.sec("5. CLIENT ACKNOWLEDGMENT"),
    H.para([H.run("By signing this waiver, the Client confirms that:")]),
    H.sp(80),
    ...[
      "The decision to source workforce independently was made by the Client and not at M&M's direction",
      "The Client has been advised of the operational risks associated with workforce sourced outside M&M's management framework",
      "The Client accepts full responsibility for the performance and conduct of independently sourced staff",
      "This waiver does not modify any other term of the applicable Statement of Work or Master Services Agreement",
    ].map((item) => H.bul(item)),
    H.sp(200),

    H.sec("SIGNATURES"),
    H.para([
      H.run(
        "By signing below, both parties confirm the staffing scope exclusion described in this waiver and agree to the liability allocation set forth herein.",
      ),
    ]),
    H.sp(160),
    H.sigBlock(operator, "Authorized Signatory, M&M Operations LLC"),
    H.sp(200),
  ];

  const blob = await makeDoc(opts);
  const filename = safeFilename(
    `MM_Waiver_${client}_${event?.name || ""}_${new Date().toISOString().slice(0, 10)}.docx`,
  );
  return { blob, filename };
}
// ─────────────────────────────────────────────────────────────────────────────
// generateOptionsummary — Engagement Options Summary
// Add this export to generateMMDocs.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Tier floors ───────────────────────────────────────────────────────────────
const TIER_FLOORS = { T0: 7000, T1: 15000, T2: 30000, T3: 55000 };

// ── Add-on definitions with step-down logic ───────────────────────────────────
// Each add-on has a downgrade path: what it becomes in Option B and Option C
const ADD_ON_STEPDOWN = {
  // Multi-Location
  "Multi-Location Coverage (Expanded)": {
    price: 20000,
    optionB: { label: "Multi-Location Coverage (Standard)", price: 12000 },
    optionC: null, // dropped entirely
    consequence:
      "Night activations and secondary venues are client-managed. M&M covers primary venue only.",
  },
  "Multi-Location Coverage (Standard)": {
    price: 12000,
    optionB: null,
    optionC: null,
    consequence: "All locations beyond the primary venue are client-managed.",
  },
  // P4 Infrastructure
  "P4 Infrastructure (V1)": {
    price: 5000,
    optionB: null, // dropped in Option B
    optionC: null,
    consequence:
      "No operational methodology delivery. Client retains existing content and processes.",
  },
  // Enhanced Platform
  "Enhanced Platform (Advanced)": {
    price: 15000,
    optionB: { label: "Enhanced Platform (Standard)", price: 8000 },
    optionC: null,
    consequence:
      "Standard Axis deployment only. No custom integrations or advanced reporting.",
  },
  "Enhanced Platform (Standard)": {
    price: 8000,
    optionB: null,
    optionC: null,
    consequence: "Standard Axis deployment. Read-only client access.",
  },
  // Volunteer Recruitment
  "Volunteer Recruitment (High)": {
    price: 18000,
    optionB: { label: "Volunteer Recruitment (Medium)", price: 12000 },
    optionC: { label: "Volunteer Recruitment (Low)", price: 6000 },
    consequence:
      "Reduced recruitment scope. Client must support outreach through own channels.",
  },
  "Volunteer Recruitment (Medium)": {
    price: 12000,
    optionB: { label: "Volunteer Recruitment (Low)", price: 6000 },
    optionC: null,
    consequence: "Basic recruitment only. Limited community outreach.",
  },
  "Volunteer Recruitment (Low)": {
    price: 6000,
    optionB: null,
    optionC: null,
    consequence: "Recruitment scope is limited to existing community only.",
  },
  // Application Review
  "Application Review (High)": {
    price: 7000,
    optionB: { label: "Application Review (Low)", price: 3000 },
    optionC: null,
    consequence:
      "Standard screening only. Multi-tiered review process not included.",
  },
  "Application Review (Low)": {
    price: 3000,
    optionB: null,
    optionC: null,
    consequence: "Basic eligibility screening only.",
  },
  // Additional Staff
  "Additional Staff": {
    price: 4500, // per person — handled separately
    optionB: null,
    optionC: null,
    consequence: "Reduced staffing deployment. Standard team structure only.",
  },
};

function getTierFloor(tier) {
  if (!tier) return 55000;
  const t = tier.toUpperCase();
  if (t.includes("0")) return TIER_FLOORS.T0;
  if (t.includes("1")) return TIER_FLOORS.T1;
  if (t.includes("2")) return TIER_FLOORS.T2;
  return TIER_FLOORS.T3;
}

// Parse add-ons array from pricing log into labeled objects
function parseAddOns(addOns) {
  if (!addOns || !Array.isArray(addOns)) return [];
  return addOns.map((a) => {
    if (typeof a === "string")
      return { label: a, price: ADD_ON_STEPDOWN[a]?.price || 0 };
    return {
      label: a.label || a.name || String(a),
      price: a.price || ADD_ON_STEPDOWN[a.label]?.price || 0,
    };
  });
}

// Build scoped option from base price + add-on list
function buildOption(
  baseAnchor,
  addOns,
  escalatorMult,
  label,
  description,
  consequences,
) {
  const addOnTotal = addOns.reduce((sum, a) => sum + (a.price || 0), 0);
  const subtotal = Math.round((baseAnchor + addOnTotal) * (escalatorMult || 1));
  return {
    label,
    description,
    price: subtotal,
    baseAnchor,
    addOns,
    addOnTotal,
    escalatorMult,
    consequences,
  };
}

export async function generateOptionsummary({
  client,
  event,
  pricingLog,
  operator,
  today,
}) {
  const H = await h();

  const tier = pricingLog?.tier || "T3";
  const pillar = pricingLog?.pillar || event?.pillar || "P1";
  const clientTotal = Number(
    pricingLog?.client_total || pricingLog?.final_price || 0,
  );
  const baseAnchor = Number(pricingLog?.base_anchor || 0);
  const addOnTotal = Number(pricingLog?.add_on_total || 0);
  const escalatorMult = Number(pricingLog?.escalator_mult || 1);
  const vri = pricingLog?.vri_band || "—";
  const wrr = pricingLog?.wrr_band || "—";
  const reserveLevel = pricingLog?.reserve_level || null;
  const attendees = event?.attendee_count || "";
  const eventName = event?.name || "";
  const eventDate = event?.start_date || event?.event_date || "";
  const tierFloor = getTierFloor(tier);

  // Parse add-ons from pricing log
  const parsedAddOns = parseAddOns(pricingLog?.add_ons || []);

  // ── Build Option A — Full engagement (the confirmed quote) ──────────────────
  const optionA = {
    label: "Option A — Full Engagement",
    description:
      "Complete scope as quoted. M&M delivers full operational authority, all add-ons, and the complete service suite.",
    price: clientTotal,
    baseAnchor,
    addOns: parsedAddOns,
    addOnTotal,
    escalatorMult,
    consequences: [],
  };

  // ── Build Option B — Reduced add-ons ───────────────────────────────────────
  const optionBAddOns = [];
  const optionBConseq = [];
  for (const addOn of parsedAddOns) {
    const stepdown = ADD_ON_STEPDOWN[addOn.label];
    if (!stepdown) {
      optionBAddOns.push(addOn);
      continue;
    }
    if (stepdown.optionB) {
      optionBAddOns.push(stepdown.optionB);
      optionBConseq.push(stepdown.consequence);
    } else {
      // Dropped — add consequence if it has one
      if (stepdown.consequence) optionBConseq.push(stepdown.consequence);
    }
  }
  const optionBTotal = Math.round(
    (baseAnchor + optionBAddOns.reduce((s, a) => s + (a.price || 0), 0)) *
      escalatorMult,
  );

  const optionB = {
    label: "Option B — Core Engagement",
    description:
      "Execution focus. Key add-ons reduced or removed. M&M manages primary operations with a leaner scope.",
    price: optionBTotal,
    baseAnchor,
    addOns: optionBAddOns,
    addOnTotal: optionBAddOns.reduce((s, a) => s + (a.price || 0), 0),
    escalatorMult,
    consequences: optionBConseq,
  };

  // ── Build Option C — Execution only ────────────────────────────────────────
  // Strip all add-ons, keep only base anchor
  const optionCTotal = Math.round(baseAnchor * escalatorMult);
  const optionCConseq = parsedAddOns
    .map((a) => ADD_ON_STEPDOWN[a.label]?.consequence)
    .filter(Boolean);

  // Check if Option C is below floor
  const optionCBelowFloor = optionCTotal < tierFloor;

  const optionC = {
    label: optionCBelowFloor
      ? `Option C — Minimum Viable Engagement (Below ${tier} Floor)`
      : "Option C — Execution Only",
    description: optionCBelowFloor
      ? `Base execution only. This configuration falls below the ${tier} floor of ${fmt(tierFloor)}. Scope is significantly reduced — M&M provides floor presence only with no supporting infrastructure.`
      : "Base execution only. No add-ons. M&M provides core floor management and Axis standard deployment.",
    price: optionCBelowFloor ? tierFloor : optionCTotal,
    baseAnchor,
    addOns: [],
    addOnTotal: 0,
    escalatorMult,
    consequences: [
      ...optionCConseq,
      ...(optionCBelowFloor
        ? [
            "This engagement is priced below the standard tier floor. Scope has been significantly reduced to reflect a materially different service level.",
            "No Team Lead structure beyond minimum coverage.",
            "No post-event intelligence report.",
            "No orientation curriculum or pre-event crew preparation beyond basic briefing.",
          ]
        : []),
    ],
  };

  // ── Collapse to 2 options if B and C are within $5k of each other ──────────
  const showThreeOptions = Math.abs(optionB.price - optionC.price) > 5000;
  const options = showThreeOptions
    ? [optionA, optionB, optionC]
    : [optionA, optionB];

  // ── Build the document ─────────────────────────────────────────────────────
  const opts = H.base("Engagement Options Summary");

  const optionSection = (opt, idx) => {
    const isFloorWarning = opt.price < tierFloor;
    const letterColor = idx === 0 ? H.GREEN : idx === 1 ? "#1C4A36" : "#6B7280";

    return [
      H.sp(160),
      // Option header
      new H.Table({
        width: { size: 9360, type: H.WidthType.DXA },
        columnWidths: [9360],
        rows: [
          new H.TableRow({
            children: [
              new H.TableCell({
                borders: H.brd,
                shading: {
                  fill: idx === 0 ? "1C4A36" : idx === 1 ? "F1F5F9" : "F9FAFB",
                  type: H.ShadingType.CLEAR,
                },
                margins: H.cm,
                children: [
                  H.para([
                    H.bold(opt.label, {
                      size: 26,
                      color: idx === 0 ? "FFFFFF" : H.GREEN,
                    }),
                    H.run("   "),
                    H.bold(fmt(opt.price), {
                      size: 26,
                      color: idx === 0 ? "EBC764" : H.GREEN,
                    }),
                  ]),
                  H.para([
                    H.run(opt.description, {
                      size: 20,
                      color: idx === 0 ? "CCCCCC" : H.GRAY,
                    }),
                  ]),
                ],
              }),
            ],
          }),
        ],
      }),

      // Included services
      H.sp(80),
      H.para([H.bold("What's Included", { color: H.GREEN })]),
      H.sp(40),
      H.infoTbl([
        ["Base Engagement", `${tier} — ${fmt(opt.baseAnchor)}`],
        ...(opt.addOns.length > 0
          ? opt.addOns.map((a) => [a.label, fmt(a.price)])
          : [["Add-Ons", "None"]]),
        ...(opt.escalatorMult > 1
          ? [["Escalator Applied", `×${opt.escalatorMult.toFixed(2)}`]]
          : []),
        ["Total", fmt(opt.price)],
      ]),

      // Consequences / tradeoffs
      ...(opt.consequences.length > 0
        ? [
            H.sp(80),
            H.para([
              H.bold("What You Give Up", {
                color: isFloorWarning ? H.RED : "#8a6800",
              }),
            ]),
            H.sp(40),
            ...opt.consequences.map((c) =>
              H.bul(c, isFloorWarning ? H.RED : "#8a6800"),
            ),
          ]
        : [
            H.sp(80),
            H.para([
              H.run("Full scope included. No tradeoffs.", {
                color: H.GRAY,
                italic: true,
              }),
            ]),
          ]),

      ...(isFloorWarning
        ? [
            H.sp(80),
            H.notice(
              `This option is priced below the standard ${tier} floor of ${fmt(tierFloor)}. This configuration requires Founder authorization and represents a materially reduced engagement — not a standard discount.`,
              "FEF2F2",
              H.RED,
              H.RED,
            ),
          ]
        : []),
    ];
  };

  opts.sections[0].children = [
    H.sp(200),
    H.para([
      H.bold("ENGAGEMENT OPTIONS SUMMARY", { size: 36, color: H.GREEN }),
    ]),
    H.sp(40),
    H.para([
      H.run(`${client}  |  ${eventName}`, {
        size: 24,
        bold: true,
        color: H.GOLD,
      }),
    ]),
    H.para([
      H.run(
        `Prepared by ${operator}  |  ${today}  |  Internal & Negotiation Use`,
        { color: H.GRAY },
      ),
    ]),
    H.sp(80),
    H.notice(
      "This document is for internal review and negotiation purposes. It presents three scope configurations at different investment levels. Present to the client only at the discretion of the lead Founder.",
    ),
    H.sp(80),

    // Context table
    H.infoTbl([
      ["Client", client],
      ["Event", eventName],
      ["Event Date", eventDate || "TBD"],
      ["Attendance", attendees ? Number(attendees).toLocaleString() : "TBD"],
      ["Engagement Pillar", pillar],
      ["Tier", tier],
      ["VRI Band", vri],
      ["WRR Band", wrr],
      ["Tier Floor", fmt(tierFloor)],
      ["Full Quote", fmt(clientTotal)],
      [
        "Reserve Status",
        pricingLog?.reserve_amount > 0
          ? `Level ${reserveLevel} — ${fmt(pricingLog.reserve_amount)}`
          : "Excluded",
      ],
    ]),
    H.sp(80),
    H.notice(
      "Labor reserve is not included in any option below unless explicitly noted. Reserve status is set per the pricing engine run and remains unchanged across all options.",
      "FFF8E7",
      "#8a6800",
      "#EBC764",
    ),

    // Options
    ...options.flatMap((opt, idx) => optionSection(opt, idx)),

    H.sp(200),

    // Negotiation notes section
    H.para([H.bold("NEGOTIATION NOTES", { size: 24, color: H.GREEN })]),
    H.sp(40),
    H.para([
      H.run(
        "Use this section to document scope decisions made during the negotiation.",
        { color: H.GRAY },
      ),
    ]),
    H.sp(80),
    H.infoTbl([
      ["Option Selected", ""],
      ["Agreed Price", ""],
      ["Scope Adjustments", ""],
      ["Discount Applied", ""],
      ["Discount Authorized By", ""],
      ["Notes", ""],
    ]),

    H.sp(200),
    new H.Paragraph({
      border: {
        top: {
          style: H.BorderStyle.SINGLE,
          size: 4,
          color: "E5E7EB",
          space: 1,
        },
      },
      spacing: { before: 120, after: 0 },
      alignment: H.AlignmentType.CENTER,
      children: [
        H.run(
          "M&M Operations  |  Confidential — Internal & Negotiation Use Only",
          { size: 18, color: H.GRAY, italic: true },
        ),
      ],
    }),
  ];

  const blob = await makeDoc(opts);
  const filename = safeFilename(
    `MM_Options_${client}_${eventName}_${new Date().toISOString().slice(0, 10)}.docx`,
  );
  return { blob, filename };
}
