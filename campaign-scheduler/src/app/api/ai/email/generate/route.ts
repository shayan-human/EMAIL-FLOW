import { NextResponse } from "next/server";
import { Ollama } from "ollama";

const MODEL = "kimi-k2.5:cloud";

const SPAM_WARNING = `IMPORTANT: Avoid ALL email spam trigger words. Do NOT use:

URGENCY/PRESSURE: Act now, Limited time, Expires today, Don't delay, Urgent, Last chance
MONEY/OFFERS: Free, No cost, Guarantee, Cash, Earn money, Extra income, Make money fast, No fees, Prize, Winner, Congratulations
CLICKBAIT: Click here, Visit our website, Call now, Order now, Buy direct
SHADY PHRASING: No catch, No obligation, No hidden fees, Risk free, 100% satisfied, As seen on
CAPS/PUNCTUATION: FREE!!!, ACT NOW!!!, YOU WON!!!

AI WRITING PATTERNS TO AVOID:
- Do NOT use dashes (--) as separators or in sentences
- Do NOT use formal/soulless phrases like "I hope this email finds you well"
- Do NOT use robotic transitions like "Furthermore", "Moreover", "Additionally"
- Avoid starting sentences with "It's important to note" or "Please don't hesitate"
- Avoid overly perfect grammar without natural variation

WRITE NATURALLY:
- Use conversational, human-like language
- Vary sentence length - mix short punchy with longer flowing sentences
- Include slight imperfections that humans naturally have
- Sound like a real person would write, not an AI`;

export async function POST(req: Request) {
    try {
        const apiKey = process.env.OLLAMA_API_KEY;
        
        if (!apiKey) {
            return NextResponse.json(
                { error: "Ollama API key not configured" },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { prompt, type } = body;

        if (!prompt || !type) {
            return NextResponse.json(
                { error: "Prompt and type are required" },
                { status: 400 }
            );
        }

        let systemPrompt = "";
        const userMessage = prompt;

        switch (type) {
            case "subject":
                systemPrompt = `You are an expert copywriter. Generate a compelling, personalized email subject line. Keep it short, curiosity-inducing, and relevant. Only output the subject line, nothing else.

${SPAM_WARNING}`;
                break;
            case "body":
                systemPrompt = `You are an expert cold email copywriter. Write a concise, personalized email body that feels natural and not spammy. Use the personalization tags provided: {{firstName}}, {{lastName}}, {{fullName}}, {{businessName}}, {{email}}, {{website}}. Keep it under 200 words. Only output the email body, no subject.

${SPAM_WARNING}`;
                break;
            case "both":
                systemPrompt = `You are an expert cold email copywriter. Generate both a subject line and email body. The subject should be short and curiosity-inducing. The body should be concise, personalized, and under 200 words. Use personalization tags: {{firstName}}, {{lastName}}, {{fullName}}, {{businessName}}, {{email}}, {{website}}. Format your response as:

SUBJECT: <subject line>

BODY:
<email body>

${SPAM_WARNING}`;
                break;
            default:
                return NextResponse.json(
                    { error: "Invalid type. Use: subject, body, or both" },
                    { status: 400 }
                );
        }

        const ollama = new Ollama({
            host: "https://ollama.com",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });

        const response = await ollama.chat({
            model: MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
        });

        const content = response.message?.content || "";

        let subject = "";
        let emailBody = "";

        if (type === "both") {
            const parts = content.split(/SUBJECT:|BODY:/i);
            parts.forEach((part: string) => {
                const trimmed = part.trim();
                if (trimmed && !subject) {
                    subject = trimmed;
                } else if (trimmed) {
                    emailBody = trimmed;
                }
            });
        } else if (type === "subject") {
            subject = content;
        } else {
            emailBody = content;
        }

        return NextResponse.json({
            subject: subject.trim(),
            body: emailBody.trim()
        });

    } catch (error) {
        console.error("[Ollama API Error]:", error);
        return NextResponse.json(
            { error: "Failed to generate email content" },
            { status: 500 }
        );
    }
}
