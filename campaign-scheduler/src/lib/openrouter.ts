export type GenerateType = "subject" | "body" | "both";

export interface GenerateEmailParams {
    prompt: string;
    type: GenerateType;
}

export interface GenerateEmailResponse {
    subject?: string;
    body?: string;
    error?: string;
}

export async function generateEmailContent(
    params: GenerateEmailParams
): Promise<GenerateEmailResponse> {
    try {
        const response = await fetch("/api/ai/email/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
        });

        const data = await response.json();

        if (!response.ok) {
            return { error: data.error || "Failed to generate content" };
        }

        return data;
    } catch (error) {
        console.error("generateEmailContent error:", error);
        return { error: "Network error occurred" };
    }
}
