const assert = require('assert');

function replacePlaceholders(template, lead) {
    if (!template) return '';
    // Handle both snake_case (from DB) and camelCase (from frontend if used there)
    const firstName = lead.first_name || lead.firstName || '';
    const lastName = lead.last_name || lead.lastName || '';
    const fullName = lead.full_name || lead.fullName || '';
    const businessName = lead.business_name || lead.businessName || '';
    const website = lead.website || lead.website || '';
    const email = lead.email || '';

    return template
        .replace(/\{\{firstName\}\}/g, firstName)
        .replace(/\{\{lastName\}\}/g, lastName)
        .replace(/\{\{fullName\}\}/g, fullName)
        .replace(/\{\{businessName\}\}/g, businessName)
        .replace(/\{\{website\}\}/g, website)
        .replace(/\{\{email\}\}/g, email);
}

const snakeCaseLead = {
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    business_name: 'Acme Corp',
    website: 'https://acme.com',
    email: 'john@example.com'
};

const camelCaseLead = {
    firstName: 'Jane',
    lastName: 'Smith',
    fullName: 'Jane Smith',
    businessName: 'Globex',
    website: 'https://globex.com',
    email: 'jane@example.com'
};

const templates = [
    {
        input: 'Hey {{firstName}}!',
        lead: snakeCaseLead,
        expected: 'Hey John!'
    },
    {
        input: 'Hey {{firstName}}!',
        lead: camelCaseLead,
        expected: 'Hey Jane!'
    },
    {
        input: 'Subject: {{businessName}} Update',
        lead: snakeCaseLead,
        expected: 'Subject: Acme Corp Update'
    },
    {
        input: 'Subject: {{businessName}} Update',
        lead: camelCaseLead,
        expected: 'Subject: Globex Update'
    },
    {
        input: 'Check your site: {{website}}',
        lead: snakeCaseLead,
        expected: 'Check your site: https://acme.com'
    },
    {
        input: 'Project: {{fullName}} for {{email}}',
        lead: camelCaseLead,
        expected: 'Project: Jane Smith for jane@example.com'
    }
];

console.log('--- Running Robust Placeholder Replacement Tests ---');

templates.forEach((t, i) => {
    const result = replacePlaceholders(t.input, t.lead);
    try {
        assert.strictEqual(result, t.expected);
        console.log(`✅ Test ${i + 1} passed`);
    } catch (err) {
        console.error(`❌ Test ${i + 1} failed: Expected "${t.expected}", got "${result}"`);
        process.exit(1);
    }
});

console.log('--- All Tests Passed! ---');
