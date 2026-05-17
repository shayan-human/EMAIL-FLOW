"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Reuse existing step components
import { Step1Accounts } from "@/components/campaign-builder/Step1Accounts";
import { Step2Leads, MappedLead } from "@/components/campaign-builder/Step2Leads";
import { Step3Copy } from "@/components/campaign-builder/Step3Copy";
import { CampaignScheduler } from "@/components/campaign/CampaignScheduler";

const steps = [
    { number: 1, title: "Sender Account" },
    { number: 2, title: "Upload Leads" },
    { number: 3, title: "Email Copy" },
    { number: 4, title: "Schedule" },
];

export default function NewCampaignPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(1);

    // Campaign state passed between steps
    const [leads, setLeads] = useState<MappedLead[]>([]);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [senderDisplayName, setSenderDisplayName] = useState<string | undefined>(undefined);
    const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
    const [copyMode, setCopyMode] = useState<"single" | "rotate">("single");

    const handleNextStep1 = () => setCurrentStep(2);

    const handleNextStep2 = (mappedLeads: MappedLead[]) => {
        setLeads(mappedLeads);
        setCurrentStep(3);
    };

    const handleNextStep3 = (subj: string, msg: string, acctIds: string[], displayName?: string, draftIds?: string[], mode?: "single" | "rotate") => {
        setSubject(subj);
        setBody(msg);
        setSelectedAccountIds(acctIds);
        setSenderDisplayName(displayName);
        setSelectedDraftIds(draftIds || []);
        setCopyMode(mode || "single");
        setCurrentStep(4);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/campaigns")}
                    className="shrink-0"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">New Campaign</h1>
                    <p className="text-muted-foreground mt-0.5">
                        Walk through each step to create and schedule your campaign.
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between px-8 relative overflow-hidden">
                {steps.map((step, index) => (
                    <div key={step.number} className="flex items-center relative z-10 w-full">
                        <div
                            className={`flex flex-col items-center gap-2 transition-opacity duration-200 ${currentStep === step.number
                                ? "opacity-100"
                                : currentStep > step.number
                                    ? "opacity-70"
                                    : "opacity-40"
                                }`}
                        >
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200 ${currentStep === step.number
                                    ? "bg-foreground text-background ring-4 ring-foreground/10"
                                    : currentStep > step.number
                                        ? "bg-emerald-500 text-white"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                            >
                                {currentStep > step.number ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                    step.number
                                )}
                            </div>
                            <span
                                className={`text-xs font-semibold uppercase tracking-wider ${currentStep >= step.number
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                                    }`}
                            >
                                {step.title}
                            </span>
                        </div>
                        {index < steps.length - 1 && (
                            <div
                                className={`flex-1 h-1 mx-4 rounded-full transition-colors duration-300 ${currentStep > step.number ? "bg-emerald-500" : "bg-muted"
                                    }`}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div className="bg-card border rounded-2xl p-6 md:p-10 shadow-sm min-h-[500px]">
                {currentStep === 1 && <Step1Accounts onNext={handleNextStep1} />}
                {currentStep === 2 && (
                    <Step2Leads onNext={handleNextStep2} onBack={() => setCurrentStep(1)} />
                )}
                {currentStep === 3 && (
                    <Step3Copy onNext={handleNextStep3} onBack={() => setCurrentStep(2)} />
                )}
                {currentStep === 4 && (
                    <CampaignScheduler
                        leads={leads}
                        subject={subject}
                        body={body}
                        selectedAccountIds={selectedAccountIds}
                        senderDisplayName={senderDisplayName}
                        selectedDraftIds={selectedDraftIds}
                        copyMode={copyMode}
                        onBack={() => setCurrentStep(3)}
                    />
                )}
            </div>
        </div>
    );
}
