CREATE OR REPLACE FUNCTION update_lead_status_from_webhook(
    p_campaign_id UUID,
    p_email TEXT,
    p_event TEXT,
    p_gmail_message_id TEXT DEFAULT NULL,
    p_gmail_thread_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS as it runs as the function owner
AS $$
DECLARE
    v_lead_id UUID;
    v_new_status TEXT;
    v_reply_count INT;
BEGIN
    -- Determine new status
    CASE p_event
        WHEN 'EMAIL_SENT' THEN v_new_status := 'SENT';
        WHEN 'EMAIL_REPLY' THEN v_new_status := 'REPLIED';
        WHEN 'EMAIL_FAILED' THEN v_new_status := 'FAILED';
        WHEN 'EMAIL_BOUNCED' THEN v_new_status := 'BOUNCED';
        ELSE 
            RETURN jsonb_build_object('success', false, 'error', 'Invalid event type');
    END CASE;

    -- Find the lead
    SELECT id, reply_count INTO v_lead_id, v_reply_count
    FROM leads
    WHERE campaign_id = p_campaign_id AND email = p_email
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
    END IF;

    -- Update the lead
    UPDATE leads
    SET 
        status = v_new_status,
        sent_at = CASE WHEN p_event = 'EMAIL_SENT' THEN NOW() ELSE sent_at END,
        replied_at = CASE WHEN p_event = 'EMAIL_REPLY' THEN NOW() ELSE replied_at END,
        reply_count = CASE WHEN p_event = 'EMAIL_REPLY' THEN COALESCE(v_reply_count, 0) + 1 ELSE reply_count END,
        gmail_message_id = COALESCE(p_gmail_message_id, gmail_message_id),
        gmail_thread_id = COALESCE(p_gmail_thread_id, gmail_thread_id)
    WHERE id = v_lead_id;

    RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id);
END;
$$;
