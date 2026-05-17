"use client";

import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { UploadCloud, FileSpreadsheet, CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface MappedLead {
    email: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    businessName?: string;
    website?: string;
}

interface Step2Props {
    onNext: (mappedLeads: MappedLead[], totalCount: number) => void;
    onBack: () => void;
}

export function Step2Leads({ onNext, onBack }: Step2Props) {
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isLoadingExisting, setIsLoadingExisting] = useState(true);
    const [totalRows, setTotalRows] = useState(0);
    const [stats, setStats] = useState({ duplicate: 0, fake: 0, personal: 0, business: 0 });
    const [businessOnly, setBusinessOnly] = useState(false);
    
    // Existing emails from user's past campaigns and blocklist
    const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
    const [blockedEmails, setBlockedEmails] = useState<Set<string>>(new Set());

    // Column Mapping State
    const [emailCol, setEmailCol] = useState<string>("");
    const [firstNameCol, setFirstNameCol] = useState<string>("");
    const [lastNameCol, setLastNameCol] = useState<string>("");
    const [fullNameCol, setFullNameCol] = useState<string>("");
    const [businessNameCol, setBusinessNameCol] = useState<string>("");
    const [websiteCol, setWebsiteCol] = useState<string>("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch existing emails from past campaigns and blocklist on mount
    useEffect(() => {
        async function fetchExistingEmails() {
            try {
                const response = await fetch('/api/leads');
                if (response.ok) {
                    const data = await response.json();
                    setExistingEmails(new Set(data.existingEmails || []));
                    setBlockedEmails(new Set(data.blockedEmails || []));
                }
            } catch (error) {
                console.error('Failed to fetch existing emails:', error);
            } finally {
                setIsLoadingExisting(false);
            }
        }
        fetchExistingEmails();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith(".csv")) {
            toast.error("Please select a valid CSV file");
            return;
        }

        setFile(selectedFile);
        parseCSV(selectedFile);
    };

    const parseCSV = (csvFile: File) => {
        setIsParsing(true);
        Papa.parse(csvFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                setIsParsing(false);
                if (results.errors.length > 0 && results.data.length === 0) {
                    toast.error("Failed to parse CSV file");
                    return;
                }

                const cols = results.meta.fields || [];
                setHeaders(cols);
                const resultsData = results.data as any[];
                setTotalRows(resultsData.length);
                setPreviewData(resultsData.slice(0, 3));

                // Detect Stats (if email column is found/selected)
                const emailMatches = cols.filter(c => c.toLowerCase().includes("email"));
                const bestEmailCol = emailMatches[0];

                if (bestEmailCol) {
                    const PUBLIC_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
                    const DISPOSABLE_DOMAINS = ['mailinator.com', '10minutemail.com', 'temp-mail.org'];
                    
                    let duplicate = 0;
                    let fake = 0;
                    let personal = 0;
                    let business = 0;

                    // Track emails in current CSV for duplicate detection within CSV
                    const csvEmails = new Set<string>();

                    resultsData.forEach(row => {
                        const e = row[bestEmailCol]?.trim().toLowerCase();
                        if (!e || !e.includes('@')) {
                            fake++;
                            return;
                        }
                        
                        // Check for duplicate within current CSV
                        if (csvEmails.has(e)) {
                            duplicate++;
                            return;
                        }
                        csvEmails.add(e);
                        
                        const domain = e.split('@')[1];
                        if (DISPOSABLE_DOMAINS.includes(domain)) fake++;
                        else if (PUBLIC_DOMAINS.includes(domain)) personal++;
                        else business++;
                    });
                    setStats({ duplicate, fake, personal, business });
                }

                // Auto-detect columns ...
                const eMatch = cols.find(c => c.toLowerCase().includes("email"));
                const fMatch = cols.find(c => c.toLowerCase().includes("first") || c.toLowerCase() === "name");

                if (eMatch) setEmailCol(eMatch);
                if (fMatch) setFirstNameCol(fMatch);

                const lMatch = cols.find(c => c.toLowerCase().includes("last") && c.toLowerCase().includes("name"));
                const fullNameMatch = cols.find(c => c.toLowerCase().includes("full") && c.toLowerCase().includes("name"));
                const bMatch = cols.find(c => c.toLowerCase().includes("business") || c.toLowerCase().includes("company"));
                const wMatch = cols.find(c => c.toLowerCase().includes("website") || c.toLowerCase().includes("url"));

                if (lMatch) setLastNameCol(lMatch);
                if (fullNameMatch) setFullNameCol(fullNameMatch);
                if (bMatch) setBusinessNameCol(bMatch);
                if (wMatch) setWebsiteCol(wMatch);
            },
            error: (error) => {
                setIsParsing(false);
                toast.error(`Parser error: ${error.message}`);
            }
        });
    };

    const handleNext = () => {
        if (!emailCol) {
            toast.error("Email column mapping is required");
            return;
        }

        if (!file) return;

        // Public/Personal domains for detection
        const PUBLIC_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
        const DISPOSABLE_DOMAINS = ['mailinator.com', '10minutemail.com', 'temp-mail.org'];

        setIsParsing(true);
        const finalLeads: MappedLead[] = [];
        let validCount = 0;
        let skippedPersonalCount = 0;
        let skippedDuplicateCount = 0;

        // Track emails in current CSV to detect duplicates within CSV
        const processedCsvEmails = new Set<string>();

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            step: (row) => {
                const data: any = row.data;
                const e = data[emailCol]?.trim().toLowerCase();

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const isValidFormat = e && emailRegex.test(e);
                
                if (isValidFormat) {
                    // Check for duplicate within current CSV
                    if (processedCsvEmails.has(e)) {
                        skippedDuplicateCount++;
                        return;
                    }
                    processedCsvEmails.add(e);
                    
                    const domain = e.split('@')[1];
                    const isDisposable = DISPOSABLE_DOMAINS.includes(domain);
                    const isPersonal = PUBLIC_DOMAINS.includes(domain);

                    if (isDisposable) return; // Always skip disposable

                    if (businessOnly && isPersonal) {
                        skippedPersonalCount++;
                        return;
                    }

                    finalLeads.push({
                        email: e,
                        firstName: firstNameCol ? (data[firstNameCol]?.trim() || "") : "",
                        lastName: lastNameCol ? (data[lastNameCol]?.trim() || "") : "",
                        fullName: fullNameCol ? (data[fullNameCol]?.trim() || "") : "",
                        businessName: businessNameCol ? (data[businessNameCol]?.trim() || "") : "",
                        website: websiteCol ? (data[websiteCol]?.trim() || "") : "",
                    });
                    validCount++;
                }
            },
            complete: () => {
                setIsParsing(false);
                if (skippedDuplicateCount > 0) {
                    toast.info(`Skipped ${skippedDuplicateCount} duplicate emails (repeated in CSV)`);
                }
                if (skippedPersonalCount > 0) {
                    toast.info(`Skipped ${skippedPersonalCount} personal emails (Business Only enabled)`);
                }
                toast.success(`Successfully mapped ${validCount} leads`);
                onNext(finalLeads, validCount);
            }
        });
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 relative">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-heading font-bold text-foreground">Lead Source</h2>
                <p className="text-muted-foreground">Upload your CSV and map the required fields.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Upload Area */}
                <Card className="border shadow-md" style={{ backgroundColor: "#141414", borderColor: "#222222" }}>
                    <CardHeader>
                        <CardTitle className="text-xl font-heading flex items-center gap-2">
                            <UploadCloud className="h-5 w-5 text-primary" />
                            Upload List
                        </CardTitle>
                        <CardDescription>Select a .csv file containing your leads.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!file ? (
                            <div
                                className="border-2 border-dashed border-primary/20 hover:border-primary/50 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/50 dark:bg-zinc-950/50"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept=".csv"
                                    className="hidden"
                                />
                                <FileSpreadsheet className="h-12 w-12 text-primary/40 mb-4" />
                                <p className="text-foreground font-semibold">Click to upload CSV</p>
                                <p className="text-sm text-muted-foreground mt-2 text-center">Maximum recommended size: 50,000 rows.</p>
                            </div>
                        ) : (
                            <div className="border border-primary/20 rounded-xl p-6 bg-primary/5 relative overflow-hidden">
                                <div className="flex items-start justify-between relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-primary/20 p-3 rounded-lg">
                                            <FileSpreadsheet className="h-8 w-8 text-primary" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-foreground truncate max-w-[200px]" title={file.name}>{file.name}</h4>
                                            <p className="text-sm text-muted-foreground">{totalRows.toLocaleString()} total rows detected</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setFile(null)}>Change</Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Mapping Area */}
                <Card className={`border-0 shadow-md ring-1 ring-black/5 transition-opacity ${!file ? 'opacity-50 pointer-events-none' : ''}`}>
                    <CardHeader className="pb-4">
                        <div className="space-y-4">
                            <Label className="text-base font-semibold">Column Mapping</Label>
                            
                            {isLoadingExisting ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-sm text-muted-foreground">Checking for duplicates...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-4 gap-2 py-2">
                                        <div className="bg-green-500/10 border border-green-500/20 rounded-md p-2 text-center">
                                            <div className="text-xs text-green-500 font-medium">Business</div>
                                            <div className="text-lg font-bold text-green-500">{stats.business}</div>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-2 text-center">
                                            <div className="text-xs text-yellow-500 font-medium">Personal</div>
                                            <div className="text-lg font-bold text-yellow-500">{stats.personal}</div>
                                        </div>
                                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-2 text-center">
                                            <div className="text-xs text-orange-500 font-medium">Duplicate</div>
                                            <div className="text-lg font-bold text-orange-500">{stats.duplicate}</div>
                                        </div>
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-2 text-center">
                                            <div className="text-xs text-red-500 font-medium">Fake/Bad</div>
                                            <div className="text-lg font-bold text-red-500">{stats.fake}</div>
                                        </div>
                                    </div>
                                    {stats.duplicate > 0 && (
                                        <p className="text-xs text-muted-foreground text-center">
                                            Duplicates: repeated emails in this file
                                        </p>
                                    )}
                                </>
                            )}

                            <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-semibold">Business Only Mode</Label>
                                    <p className="text-xs text-muted-foreground">Skip personal emails (Gmail, Yahoo, etc.)</p>
                                </div>
                                <Button 
                                    variant={businessOnly ? "default" : "outline"} 
                                    size="sm"
                                    onClick={() => setBusinessOnly(!businessOnly)}
                                    className="h-8"
                                >
                                    {businessOnly ? "Enabled" : "Disabled"}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Email Address <span className="text-destructive">*</span></Label>
                            <Select value={emailCol} onValueChange={setEmailCol}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select CSV Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">First Name (Optional)</Label>
                            <Select value={firstNameCol || "none"} onValueChange={(v) => setFirstNameCol(v === "none" ? "" : v)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select CSV Column (Optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">Last Name (Optional)</Label>
                            <Select value={lastNameCol || "none"} onValueChange={(v) => setLastNameCol(v === "none" ? "" : v)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select CSV Column (Optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">Full Name (Optional)</Label>
                            <Select value={fullNameCol || "none"} onValueChange={(v) => setFullNameCol(v === "none" ? "" : v)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select CSV Column (Optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">Business Name (Optional)</Label>
                            <Select value={businessNameCol || "none"} onValueChange={(v) => setBusinessNameCol(v === "none" ? "" : v)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select CSV Column (Optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">Website (Optional)</Label>
                            <Select value={websiteCol || "none"} onValueChange={(v) => setWebsiteCol(v === "none" ? "" : v)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select CSV Column (Optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {previewData.length > 0 && emailCol && (
                            <div className="mt-6 pt-4 border-t">
                                <Label className="text-sm text-muted-foreground mb-3 block">Data Preview (First Row)</Label>
                                <div className="bg-muted/30 p-3 rounded-md border font-mono text-sm break-all">
                                    <span className="text-muted-foreground block text-xs">Email:</span>
                                    <span className="font-semibold">{previewData[0][emailCol] || "---"}</span>
                                    {firstNameCol && (
                                        <div className="mt-2">
                                            <span className="text-muted-foreground block text-xs">First Name:</span>
                                            <span className="font-semibold">{previewData[0][firstNameCol] || "---"}</span>
                                        </div>
                                    )}
                                    {lastNameCol && (
                                        <div className="mt-2">
                                            <span className="text-muted-foreground block text-xs">Last Name:</span>
                                            <span className="font-semibold">{previewData[0][lastNameCol] || "---"}</span>
                                        </div>
                                    )}
                                    {businessNameCol && (
                                        <div className="mt-2">
                                            <span className="text-muted-foreground block text-xs">Business Name:</span>
                                            <span className="font-semibold">{previewData[0][businessNameCol] || "---"}</span>
                                        </div>
                                    )}
                                    {websiteCol && (
                                        <div className="mt-2">
                                            <span className="text-muted-foreground block text-xs">Website:</span>
                                            <span className="font-semibold">{previewData[0][websiteCol] || "---"}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-8">
                <Button variant="ghost" size="lg" onClick={onBack} className="font-medium">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                    size="lg"
                    onClick={handleNext}
                    disabled={!file || !emailCol || isParsing}
                    className="px-8 font-bold"
                >
                    {isParsing ? "Processing..." : "Compose Email \u2192"}
                </Button>
            </div>
        </div>
    );
}
