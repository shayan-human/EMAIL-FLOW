"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Folder } from "lucide-react";

type Folder = {
    id: string;
    name: string;
    color: string;
};

type Draft = {
    id: string;
    name: string;
    subject: string | null;
    body: string | null;
    created_at: string;
    folder_id: string | null;
};

function SkeletonRow() {
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "#222222" }}>
            <div className="h-4 w-4 rounded skeleton-shimmer" />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded skeleton-shimmer" />
                <div className="h-3 w-64 rounded skeleton-shimmer" />
            </div>
        </div>
    );
}

type GroupedDrafts = {
    folder: Folder | null;
    drafts: Draft[];
};

export function RotateDraftsSelector(props: {
    enabled: boolean;
    selectedDraftIds: string[];
    onSelectedDraftIdsChange: (ids: string[]) => void;
}) {
    const { enabled, selectedDraftIds, onSelectedDraftIdsChange } = props;
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasFetched, setHasFetched] = useState(false);

    const selectedSet = useMemo(() => new Set(selectedDraftIds), [selectedDraftIds]);

    const groupedDrafts = useMemo((): GroupedDrafts[] => {
        const folderMap = new Map<string | null, Draft[]>();
        
        drafts.forEach(draft => {
            const folderId = draft.folder_id;
            if (!folderMap.has(folderId)) {
                folderMap.set(folderId, []);
            }
            folderMap.get(folderId)!.push(draft);
        });

        const result: GroupedDrafts[] = [];
        
        folders.forEach(folder => {
            const folderDrafts = folderMap.get(folder.id) || [];
            if (folderDrafts.length > 0) {
                result.push({ folder, drafts: folderDrafts });
            }
        });
        
        const uncategorized = folderMap.get(null) || [];
        if (uncategorized.length > 0) {
            result.push({ folder: null, drafts: uncategorized });
        }

        return result;
    }, [drafts, folders]);

    useEffect(() => {
        if (!enabled || hasFetched) return;
        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                const [draftsRes, foldersRes] = await Promise.all([
                    fetch("/api/drafts", { method: "GET" }),
                    fetch("/api/folders", { method: "GET" }),
                ]);
                
                if (!draftsRes.ok || !foldersRes.ok) {
                    throw new Error(`HTTP ${draftsRes.status}`);
                }
                
                const draftsJson = await draftsRes.json().catch(() => ({}));
                const foldersJson = await foldersRes.json().catch(() => ({}));
                
                const rows = Array.isArray(draftsJson?.data) ? (draftsJson.data as Draft[]) : [];
                const folderData = Array.isArray(foldersJson?.data) ? (foldersJson.data as Folder[]) : [];
                
                if (!cancelled) {
                    setDrafts(rows);
                    setFolders(folderData);
                    setHasFetched(true);
                }
            } catch (e) {
                if (!cancelled) {
                    setError("Failed to load drafts. Please refresh.");
                    setDrafts([]);
                    setFolders([]);
                    setHasFetched(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [enabled, hasFetched]);

    const toggleDraft = (id: string, checked: boolean) => {
        if (checked) {
            onSelectedDraftIdsChange([...selectedDraftIds, id]);
        } else {
            onSelectedDraftIdsChange(selectedDraftIds.filter((d) => d !== id));
        }
    };

    if (!enabled) return null;

    return (
        <div className="space-y-3">
            <div className="rounded-[10px] p-5 border" style={{ backgroundColor: "#0f0f0f", borderColor: "#222222" }}>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-white">Select Drafts to Rotate</span>
                    <span className="text-xs text-[#6b7280]">Round robin order</span>
                </div>

                {loading ? (
                    <div className="space-y-2">
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                    </div>
                ) : error ? (
                    <div className="text-center py-8">
                        <p className="text-sm text-[#6b7280]">{error}</p>
                    </div>
                ) : drafts.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm text-[#6b7280] mb-3">No drafts found. Open Drafts Library to create one.</p>
                        <a
                            href="/drafts"
                            target="_blank"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                            style={{ backgroundColor: "#F59E0B", color: "#0f0f0f" }}
                            rel="noreferrer"
                        >
                            Open Drafts Library
                        </a>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groupedDrafts.map((group) => (
                            <div key={group.folder?.id || "uncategorized"}>
                                <div className="flex items-center gap-2 mb-2">
                                    {group.folder ? (
                                        <>
                                            <Folder className="w-3.5 h-3.5" style={{ color: group.folder.color }} />
                                            <span className="text-xs uppercase tracking-wider text-[#6b7280]">{group.folder.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Folder className="w-3.5 h-3.5 text-[#888888]" />
                                            <span className="text-xs uppercase tracking-wider text-[#6b7280]">Uncategorized</span>
                                        </>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {group.drafts.map((d) => {
                                        const checked = selectedSet.has(d.id);
                                        const subj = (d.subject || "").trim();
                                        return (
                                            <div
                                                key={d.id}
                                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? "bg-white/5" : "hover:bg-white/3"}`}
                                                style={{ borderColor: checked ? "rgba(245, 158, 11, 0.35)" : "#222222" }}
                                                onClick={() => toggleDraft(d.id, !checked)}
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(c: boolean | "indeterminate") => toggleDraft(d.id, c as boolean)}
                                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-white truncate">{d.name}</div>
                                                    <div className="text-xs text-[#9ca3af] truncate">{subj || "(No subject)"}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
