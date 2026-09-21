import {
  Building2,
  TrendingUp,
  Truck,
  HardHat,
  Wrench,
  DollarSign,
  ShieldCheck,
  Cpu,
  Layers,
  FileText,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import {
  ENTERPRISE_ENTITIES,
  MultiCompanyFoundationService,
  type CompanyFinancialSummary,
} from "@/server/enterprise/multi-company-service";
import { AdvancedProjectCostService } from "@/server/enterprise/project-cost-service";
import { ContractorVendorManagementService } from "@/server/enterprise/contractor-service";
import { AssetEquipmentManagementService } from "@/server/enterprise/asset-management-service";
import { CustomerBusinessDevelopmentService } from "@/server/enterprise/crm-service";
import { AdvancedFinancialArchitectureService } from "@/server/enterprise/advanced-finance-service";
import { EnterpriseGovernanceService } from "@/server/enterprise/enterprise-governance-service";
import { EnterpriseIntegrationPlatformService } from "@/server/enterprise/integration-platform-service";

export default async function EnterprisePage({
  searchParams,
}: {
  searchParams?: Promise<{ company?: string; tab?: string }>;
}) {
  const principal = await requireCurrentPrincipal();
  const params = await searchParams;
  const requestedCompany = params?.company || "KDIPL";
  const activeTab = params?.tab || "overview";

  const companyContext = MultiCompanyFoundationService.resolveCompanyContext({
    requestedCompanyCode: requestedCompany,
    userRoleCodes: principal.roleCodes,
  });

  // Mock Consolidated Financials for demonstration
  const entitySummaries: CompanyFinancialSummary[] = [
    {
      companyCode: "KDIPL",
      companyName: "Kumar Designers & Infra Projects Limited",
      annualRevenue: 125000000,
      operationalExpense: 98000000,
      grossMargin: 27000000,
      activeProjectsCount: 14,
      openCommitments: 18500000,
      cashReserve: 34000000,
      interCompanyPayable: 2000000,
      interCompanyReceivable: 5000000,
    },
    {
      companyCode: "KDINFRA",
      companyName: "KD Infra Engineering Private Limited",
      annualRevenue: 65000000,
      operationalExpense: 51000000,
      grossMargin: 14000000,
      activeProjectsCount: 8,
      openCommitments: 9200000,
      cashReserve: 16000000,
      interCompanyPayable: 1500000,
      interCompanyReceivable: 1200000,
    },
    {
      companyCode: "KDCON",
      companyName: "KD Highway Concessions Limited",
      annualRevenue: 48000000,
      operationalExpense: 36000000,
      grossMargin: 12000000,
      activeProjectsCount: 5,
      openCommitments: 6400000,
      cashReserve: 11000000,
      interCompanyPayable: 3000000,
      interCompanyReceivable: 800000,
    },
    {
      companyCode: "KDEQUIP",
      companyName: "KD Heavy Plant & Logistics Private Limited",
      annualRevenue: 32000000,
      operationalExpense: 22000000,
      grossMargin: 10000000,
      activeProjectsCount: 4,
      openCommitments: 4100000,
      cashReserve: 7500000,
      interCompanyPayable: 500000,
      interCompanyReceivable: 4000000,
    },
  ];

  const groupRollup = MultiCompanyFoundationService.consolidateGroupFinancials(entitySummaries);

  // Sample EVM calculation
  const evmMetrics = AdvancedProjectCostService.computeEVM({
    projectId: "PRJ-TECH-01",
    projectName: "KDIPL Tech Park Expressway Extension",
    budgetAtCompletion: 50000000,
    plannedValue: 32000000,
    earnedValue: 34500000,
    actualCost: 31800000,
  });

  // Sample Pipeline
  const pipeline = CustomerBusinessDevelopmentService.evaluatePipeline([
    {
      opportunityId: "OPP-01",
      opportunityCode: "DEL-EXP-26",
      title: "Delhi-Meerut Corridor Subgrade Package",
      clientName: "NHAI / MoRTH",
      clientType: "GOVERNMENT_PSU",
      estimatedValueINR: 85000000,
      stage: "BID_SUBMISSION",
      submissionDeadline: "2026-10-15",
      bidMarginTargetPercent: 18,
      assignedDirectorId: "dir-01",
      isConvertedToProject: false,
    },
    {
      opportunityId: "OPP-02",
      opportunityCode: "NOI-IND-04",
      title: "Greater Noida Logistics Hub Groundwork",
      clientName: "Express Logistics Park Ltd",
      clientType: "PRIVATE_DEVELOPER",
      estimatedValueINR: 42000000,
      stage: "TECHNICAL_FINANCIAL_OPENING",
      submissionDeadline: "2026-09-30",
      bidMarginTargetPercent: 22,
      assignedDirectorId: "dir-02",
      isConvertedToProject: false,
    },
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 13 · Enterprise Expansion & Multi-Company Architecture"
        title="Enterprise Command Center"
        description="Unified corporate governance, multi-company consolidation, inter-project logistics, earned value cost control, and enterprise integrations."
      />

      {/* Multi-Company Entity Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <Building2 className="size-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Legal Entity
            </div>
            <div className="font-display text-base font-bold text-slate-900">
              {companyContext.companyName}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {companyContext.allowedCompanies.map((cCode) => {
            const ent = ENTERPRISE_ENTITIES[cCode];
            const isSelected = companyContext.activeCompanyCode === cCode && !companyContext.isConsolidatedView;
            return (
              <a
                key={cCode}
                href={`/enterprise?company=${cCode}&tab=${activeTab}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isSelected
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {ent.code} · {ent.name.split(" ")[0]}
              </a>
            );
          })}
          <a
            href={`/enterprise?company=GROUP&tab=${activeTab}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              companyContext.isConsolidatedView
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            🏢 Consolidated Group View
          </a>
        </div>
      </div>

      {/* Top Level Group Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <TrendingUp className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Consolidated Top-Line
              </p>
              <p className="font-display text-2xl font-bold text-slate-950">
                ₹{(groupRollup.netConsolidatedRevenue / 10000000).toFixed(1)} Cr
              </p>
              <p className="text-[11px] text-slate-500">
                Gross Margin: {groupRollup.groupGrossMarginPercent}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <Layers className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Active Projects Fleet
              </p>
              <p className="font-display text-2xl font-bold text-slate-950">
                {groupRollup.totalActiveProjects} Sites
              </p>
              <p className="text-[11px] text-slate-500">Across 4 Legal Entities</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Truck className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Capital Commitments
              </p>
              <p className="font-display text-2xl font-bold text-slate-950">
                ₹{(groupRollup.totalOpenCommitments / 10000000).toFixed(2)} Cr
              </p>
              <p className="text-[11px] text-slate-500">Open Purchase Commitments</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-purple-50 text-purple-700">
              <Cpu className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Tender Pipeline (Weighted)
              </p>
              <p className="font-display text-2xl font-bold text-slate-950">
                ₹{(pipeline.weightedPipelineValueINR / 10000000).toFixed(1)} Cr
              </p>
              <p className="text-[11px] text-slate-500">
                Unweighted: ₹{(pipeline.totalUnweightedPipelineValueINR / 10000000).toFixed(1)} Cr
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        {[
          { key: "overview", label: "Group Overview" },
          { key: "entities", label: "Legal Entities (13A)" },
          { key: "logistics", label: "Multi-Site Logistics (13B)" },
          { key: "cost", label: "EVM Cost Control (13D)" },
          { key: "contractors", label: "Contractors & WOs (13F)" },
          { key: "assets", label: "Plant & Machinery (13G)" },
          { key: "governance", label: "Governance & SoD (13K)" },
          { key: "integrations", label: "API & Gateway (13L)" },
        ].map((tab) => (
          <a
            key={tab.key}
            href={`/enterprise?company=${requestedCompany}&tab=${tab.key}`}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Main Content Areas */}
      {activeTab === "overview" || activeTab === "entities" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Entity Isolation Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Corporate Entity Registry (13A)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100">
                {Object.values(ENTERPRISE_ENTITIES).map((ent) => (
                  <div key={ent.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{ent.name}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {ent.code}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
                      <span>CIN: {ent.cin}</span>
                      <span>GSTIN: {ent.gstin}</span>
                      <span>PAN: {ent.pan}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{ent.registeredAddress}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Group Financial Consolidation Rollup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Consolidated Financial Ledger (Eliminated)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                Inter-company payables and receivables (₹
                {(groupRollup.interCompanyEliminations / 100000).toFixed(2)} Lakhs) have been
                eliminated to prevent double-counting across parent and subsidiaries.
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Gross Aggregate Revenue:</span>
                  <span className="font-semibold text-slate-900">
                    ₹{(groupRollup.totalGrossRevenue / 10000000).toFixed(2)} Cr
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2 text-red-600">
                  <span>Less: Inter-Company Transactions:</span>
                  <span>-₹{(groupRollup.interCompanyEliminations / 10000000).toFixed(2)} Cr</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2 font-bold text-slate-900">
                  <span>Net Consolidated Revenue:</span>
                  <span>₹{(groupRollup.netConsolidatedRevenue / 10000000).toFixed(2)} Cr</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Total Operating Expenses:</span>
                  <span className="text-slate-900">
                    ₹{(groupRollup.totalOperatingExpense / 10000000).toFixed(2)} Cr
                  </span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700">
                  <span>Group Gross Margin:</span>
                  <span>
                    ₹{(groupRollup.groupGrossMargin / 10000000).toFixed(2)} Cr (
                    {groupRollup.groupGrossMarginPercent}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "cost" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Earned Value Management (EVM) — Cost Performance (13D)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Cost Performance Index (CPI)</div>
                <div className="font-display text-2xl font-bold text-emerald-700">
                  {evmMetrics.costPerformanceIndex}
                </div>
                <div className="text-[11px] text-slate-500">Favorable (&gt;1.0 under budget)</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Schedule Performance Index (SPI)</div>
                <div className="font-display text-2xl font-bold text-blue-700">
                  {evmMetrics.schedulePerformanceIndex}
                </div>
                <div className="text-[11px] text-slate-500">Favorable (&gt;1.0 ahead of plan)</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Cost-to-Complete (CTC)</div>
                <div className="font-display text-2xl font-bold text-slate-900">
                  ₹{(evmMetrics.costToComplete / 100000).toFixed(1)}L
                </div>
                <div className="text-[11px] text-slate-500">Forecast remaining spend</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Variance at Completion (VAC)</div>
                <div className="font-display text-2xl font-bold text-emerald-700">
                  +₹{(evmMetrics.varianceAtCompletion / 100000).toFixed(1)}L
                </div>
                <div className="text-[11px] text-slate-500">Expected savings at finish</div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">4-Category Project Expenditure</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {evmMetrics.categories.map((cat) => (
                  <div key={cat.category} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-800">{cat.category}</div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      ₹{(cat.totalExposure / 100000).toFixed(1)}L spent
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Budget: ₹{(cat.budgetAllocated / 100000).toFixed(1)}L
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "governance" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Enterprise Governance & Segregation of Duties (13K)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-6 text-emerald-600" />
                <div>
                  <h4 className="font-bold text-slate-900">Segregation of Duties (SoD) Active</h4>
                  <p className="text-xs text-slate-500">
                    System prevents conflicting role pairings: Requester cannot approve PO; Inward
                    inspector cannot release payment.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Dual Control Status</div>
                <div className="font-bold text-emerald-700">ENFORCED</div>
                <div className="text-[11px] text-slate-400">Vendor bank details change</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Period Locking</div>
                <div className="font-bold text-blue-700">PERIOD OPEN (2026-M04)</div>
                <div className="text-[11px] text-slate-400">Prior periods hard locked</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Break-Glass Access</div>
                <div className="font-bold text-slate-900">0 ACTIVE SESSIONS</div>
                <div className="text-[11px] text-slate-400">Audit-logged emergency escalation</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
