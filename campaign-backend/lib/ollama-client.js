const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_HOST = 'https://ollama.com';
const MODEL = 'kimi-k2.5:cloud';

const PERSONAS = {
    formal: {
        greeting: 'Dear',
        signoff: 'Best regards',
        style: 'formal and professional',
        description: 'Uses formal language, proper greetings, and professional tone'
    },
    casual: {
        greeting: 'Hi',
        signoff: 'Thanks',
        style: 'casual and conversational',
        description: 'Uses relaxed language, informal greetings, and friendly tone'
    },
    friendly: {
        greeting: 'Hey',
        signoff: 'Cheers',
        style: 'warm and friendly',
        description: 'Uses upbeat language, enthusiastic tone, and casual warmth'
    }
};

const TOPICS = [
    // Project Topics (10)
    'project milestone update',
    'blocking issue resolution',
    'team achievement celebration',
    'sprint retrospective notes',
    'deadline extension request',
    'new feature proposal',
    'bug fix notification',
    'code review feedback',
    'project timeline adjustment',
    'deliverable completion',

    // Team & Collaboration (10)
    'team meeting summary',
    'collaboration opportunity',
    'brainstorm session invite',
    'cross-team sync request',
    'knowledge sharing session',
    'team building activity suggestion',
    'workload distribution concern',
    'pair programming session',
    'feedback on recent presentation',
    'handoff between team members',

    // Scheduling & Meetings (5)
    'calendar conflict resolution',
    'meeting reschedule request',
    'one-on-one check-in',
    'standup time adjustment',
    'availability update',

    // Resources & Information (8)
    'useful article share',
    'tool recommendation',
    'template sharing',
    'online course suggestion',
    'documentation update',
    'reference material link',
    'industry report share',
    'workspace resource request',

    // Data & Analysis (5)
    'quarterly report summary',
    'analytics dashboard access',
    'metric trend discussion',
    'data insight share',
    'visualization request',

    // Industry & Trends (4)
    'industry news discussion',
    'competitor update',
    'market trend observation',
    'technology update',

    // Product & User Feedback (4)
    'user feedback summary',
    'product improvement idea',
    'roadmap discussion',
    'feature request vote',

    // Admin & Operations (4)
    'budget approval request',
    'hiring process update',
    'new hire onboarding',
    'contract renewal notification',

    // Casual & Social (20)
    'lunch plans',
    'coffee break chat',
    'weekend plans',
    'team dinner suggestion',
    'movie recommendation',
    'book suggestion',
    'recipe sharing',
    'travel plans discussion',
    'pet photo share',
    'gym motivation',
    'birthday celebration',
    'work anniversary congrats',
    'promotion announcement',
    'new baby announcement',
    'house warming invite',
    'engagement celebration',
    'congratulations message',
    'thank you note',
    'get well soon wish',
    'sympathy message',

    // Specific Actions (20)
    'code review needed',
    'design feedback request',
    'budget approval needed',
    'timeline check-in',
    'resource request',
    'approval needed',
    'sign-off required',
    'review pending',
    'feedback please',
    'follow up',
    'sprint planning',
    'backlog grooming',
    'demo preparation',
    'release notes update',
    'deployment update',
    'rollback needed',
    'hotfix request',
    'security audit finding',
    'compliance check result',

    // Tools & Tech (15)
    'new IDE suggestion',
    'keyboard shortcut tip',
    'terminal trick',
    'VSCode extension recommendation',
    'Chrome extension share',
    'Slack channel suggestion',
    'Notion page link',
    'Jira ticket update',
    'Confluence doc share',
    'GitHub issue discussion',
    'API documentation review',
    'code snippet share',
    'debugging help needed',
    'performance optimization',
    'tech stack question',

    // Meetings (10)
    'standup notes share',
    'meeting reschedule',
    'calendar invite reminder',
    'dial-in information',
    'meeting link share',
    'agenda items',
    'action items summary',
    'meeting minutes share',
    'video call setup',
    'in-person vs remote discussion',

    // Data & Reports (10)
    'weekly metrics update',
    'conversion rate analysis',
    'user feedback report',
    'A/B test results',
    'heatmap analysis',
    'SEO report review',
    'ROI calculation',
    'dashboard metrics',
    'data access request',
    'analytics query help',

    // Feedback (10)
    'performance review discussion',
    'peer feedback share',
    '360 review input',
    'self-assessment write-up',
    'goals update',
    'OKR check-in',
    'progress report',
    'achievement recognition',
    'improvement suggestions',
    'career development chat',

    // Hiring (8)
    'interview feedback',
    'candidate evaluation',
    'offer letter discussion',
    'onboarding checklist',
    'team introduction',
    'role clarification',
    'job description review',
    'salary discussion',

    // Miscellaneous (14)
    'office supplies need',
    'printer issue',
    'WiFi password request',
    'parking situation',
    'shuttle schedule',
    'remote work policy',
    'dress code question',
    'holiday calendar update',
    'expense report submission',
    'receipt submission reminder',
    'vendor contact info',
    'client meeting prep',
    'stakeholder update',
    'budget discussion'
];

function getPersonaPrompt(persona) {
    const p = PERSONAS[persona] || PERSONAS.casual;
    return `Use a ${p.style}. ${p.description}.`;
}

function getRandomTopic() {
    return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

function getRandomPersona() {
    const personaKeys = Object.keys(PERSONAS);
    return personaKeys[Math.floor(Math.random() * personaKeys.length)];
}

function sanitizeEmailBody(rawBody) {
    if (!rawBody) return rawBody;
    return rawBody
        .replace(/([^\n])\n([^\n])/g, '$1 $2')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function generateWarmupEmail(persona = 'casual') {
    if (!OLLAMA_API_KEY) {
        throw new Error('OLLAMA_API_KEY not configured');
    }

    const topic = getRandomTopic();
    const personaPrompt = getPersonaPrompt(persona);

    const prompt = `Generate a short professional email. Return only valid JSON with no markdown, no backticks, no explanation.
Format: { "subject": string, "body": string, "reply": string }

Topic: ${topic}
Tone: ${personaPrompt}

IMPORTANT - Subject Guidelines:
- Be SPECIFIC and CREATIVE. Vary the style and structure.
- Reference actual things: a bug name, a person's name, a specific feature, a date, a tool name.
- Make subjects sound like real workplace emails, not templates.

GOOD subject examples:
'Fixed the login bug on staging'
'Can you review my PR #234?'
'Lunch tomorrow at 1pm?'
'Welcome to the team Sarah!'
'Bug in checkout page need help'
'Meeting notes from today'
'Sarah's last day is Friday'
'Q4 roadmap doc updated'
'Deploy to prod tonight'
'Code review for auth module'

BAD subject examples (AVOID THESE):
'Quick update'
'Quick question'
'Quick thought'
'Request for meeting'
'Q3 analysis'
'Q3 review'
'Invitation to'
'Request for Q3'
'Please review'
'Follow up'
'Need your input'
'Important update'

Body: Write 2-3 sentences in natural flowing paragraphs. Do NOT insert line breaks mid-paragraph. Only use double line breaks between paragraphs.
Reply: Write 1-2 sentences as an appropriate response to the email body.
No marketing language. No sales speak.`;

    try {
        const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OLLAMA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        let content;
        if (data.message?.content) {
            content = data.message.content.trim();
        } else if (data.message?.thinking) {
            content = (data.message.thinking + ' ' + (data.message.content || '')).trim();
        } else {
            throw new Error('No content returned from Ollama API');
        }

        if (!content) {
            throw new Error('No content returned from Ollama API');
        }

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (parseErr) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse Ollama API response as JSON: ' + content.substring(0, 200));
            }
        }

        if (!parsed.subject || !parsed.body || !parsed.reply) {
            throw new Error('Invalid response format from Ollama API');
        }

        const cleanBody = sanitizeEmailBody(parsed.body);
        const cleanReply = sanitizeEmailBody(parsed.reply);

        return {
            subject: parsed.subject,
            body: cleanBody,
            reply: cleanReply,
        };

    } catch (error) {
        console.error('[Ollama Client] Error generating email:', error.message);
        throw error;
    }
}

async function generateContextualReply(originalSubject, originalBody, senderName, persona = 'casual') {
    if (!OLLAMA_API_KEY) {
        throw new Error('OLLAMA_API_KEY not configured');
    }

    const personaPrompt = getPersonaPrompt(persona);

    const prompt = `You received this email from ${senderName}:
Subject: ${originalSubject}
Body: ${originalBody}

Write a natural reply email (1-2 sentences) that:
- Responds specifically to the content of this email
- Uses ${personaPrompt.toLowerCase()}
- Sounds like a genuine workplace response
- No formal preamble needed

Return only the reply text, no subject, no signature.`;

    try {
        const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OLLAMA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        let content;
        if (data.message?.content) {
            content = data.message.content.trim();
        } else if (data.message?.thinking) {
            content = (data.message.thinking + ' ' + (data.message.content || '')).trim();
        } else {
            throw new Error('No content returned from Ollama API');
        }

        return sanitizeEmailBody(content);

    } catch (error) {
        console.error('[Ollama Client] Error generating contextual reply:', error.message);
        throw error;
    }
}

module.exports = {
    generateWarmupEmail,
    generateContextualReply,
    getRandomPersona,
    sanitizeEmailBody,
    PERSONAS,
};
