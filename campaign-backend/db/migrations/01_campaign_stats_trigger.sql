CREATE OR REPLACE FUNCTION update_campaign_stats_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO campaign_stats (campaign_id, total_sent, total_replied, reply_rate, last_synced_at)
    SELECT 
        NEW.campaign_id,
        COALESCE(SUM(CASE WHEN status IN ('SENT', 'REPLIED') THEN 1 ELSE 0 END), 0) as total_sent,
        COALESCE(SUM(CASE WHEN status = 'REPLIED' THEN 1 ELSE 0 END), 0) as total_replied,
        CASE 
            WHEN SUM(CASE WHEN status IN ('SENT', 'REPLIED') THEN 1 ELSE 0 END) > 0 
            THEN ROUND((SUM(CASE WHEN status = 'REPLIED' THEN 1 ELSE 0 END) * 100.0 / SUM(CASE WHEN status IN ('SENT', 'REPLIED') THEN 1 ELSE 0 END)), 2)
            ELSE 0 
        END as reply_rate,
        NOW()
    FROM leads
    WHERE campaign_id = NEW.campaign_id
    ON CONFLICT (campaign_id) DO UPDATE SET
        total_sent = EXCLUDED.total_sent,
        total_replied = EXCLUDED.total_replied,
        reply_rate = EXCLUDED.reply_rate,
        last_synced_at = EXCLUDED.last_synced_at;
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON leads;

CREATE TRIGGER trigger_update_campaign_stats
AFTER INSERT OR UPDATE OF status ON leads
FOR EACH ROW
EXECUTE FUNCTION update_campaign_stats_trigger();
