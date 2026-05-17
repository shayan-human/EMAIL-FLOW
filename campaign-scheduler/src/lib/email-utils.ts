/**
 * Centralized utility for detecting bounce emails and auto-responses.
 * This is used to ensure consistency between the Dashboard stats and the Inbox view.
 */

export function isBounce(subject: string | null, body: string | null, senderEmail: string | null): boolean {
    const lowSubject = (subject || "").toLowerCase();
    const lowBody = (body || "").toLowerCase();
    const lowSender = (senderEmail || "").toLowerCase();

    // 1. Check for common bounce senders
    const bounceSenders = [
        "mailer-daemon@googlemail.com",
        "mailer-daemon@gmail.com",
        "postmaster@",
        "noreply@",
        "no-reply@",
        "delivery-status-notification"
    ];

    if (bounceSenders.some(s => lowSender.includes(s))) {
        return true;
    }

    // 2. Check for common bounce subjects
    const bounceSubjects = [
        "delivery status notification",
        "undelivered mail returned to sender",
        "delivery failure",
        "message not delivered",
        "non-delivery report",
        "returned mail",
        "failure notice",
        "undeliverable",
        "automatic reply",
        "out of office",
        "out-of-office",
        "vacation response",
        "address not found",
        "mailbox unavailable",
        "delivery report",
        "could not be delivered"
    ];

    if (bounceSubjects.some(s => lowSubject.includes(s))) {
        return true;
    }

    // 3. Check for common bounce patterns in body
    const bounceBodyPatterns = [
        "delivery has failed",
        "could not be delivered",
        "permanent failure",
        "i am out of the office",
        "will be away from",
        "on vacation",
        "auto-reply",
        "automatically generated",
        "this is an automated message",
        "address not found",
        "mailbox name not found",
        "recipient address rejected",
        "user unknown",
        "quota exceeded",
        "mailbox is full",
        "message was not delivered"
    ];

    if (bounceBodyPatterns.some(p => lowBody.includes(p))) {
        return true;
    }

    return false;
}

/**
 * Checks if a thread should be considered "Bounced" based on its messages.
 * A thread is bounced if the latest message is a bounce.
 */
export function isThreadBounced(messages: any[]): boolean {
    if (!messages || messages.length === 0) return false;
    
    // Check the latest message
    const latestMessage = [...messages].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    return isBounce(latestMessage.subject, latestMessage.body, latestMessage.senderEmail);
}
