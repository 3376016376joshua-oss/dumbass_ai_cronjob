# AI Stupid Meter Web

This deployment serves one page:

`/snapshot/compare?ids=256,220,250,268&period=7d`

## Run

```bash
npm install
npm run dev
```

## Vercel Cron

- `/api/cron/fetch-model-snapshots`
- Schedule: `0 5 * * *` UTC, which is 13:00 in Asia/Shanghai

The cron fetches the live coding data for GPT-5.5 and Claude Opus 4.6/4.7/4.8. If Feishu notifications are enabled, it sends a text summary and an inline PNG comparison image to the configured chat.

Required Vercel environment variables:

```env
CRON_SECRET=your-random-secret
```

Optional snapshot settings:

```env
MODEL_IDS=256,220,250,268
AISTUPIDLEVEL_BASE_URL=https://aistupidlevel.info
SNAPSHOT_PERSIST=0
```

Required only when Feishu notification is enabled:

```env
FEISHU_SCHEDULED_MESSAGE_ENABLED=1
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=your-feishu-app-secret
FEISHU_MESSAGE_RECEIVE_ID_TYPE=chat_id
FEISHU_MESSAGE_RECEIVE_ID=oc_xxx
FEISHU_SITE_URL=https://dumbass-ai-cronjob.vercel.app
```

Optional Feishu image setting:

```env
FEISHU_SEND_IMAGE=1
```

The Feishu app bot must be added to the target chat and must have bot message send permission. Inline image delivery also requires image upload permission, such as `im:resource` or `im:resource:upload`.

## Notes

- The home page redirects to the compare page.
- Other routes and legacy router/auth pages have been removed.
- **Community contributors** for feedback and improvements

---

**Project Links:**
- **Repository**: [https://github.com/StudioPlatforms/aistupidmeter-web](https://github.com/StudioPlatforms/aistupidmeter-web)
- **Live Site**: [https://aistupidlevel.info](https://aistupidlevel.info)
- **Demo**: [https://huggingface.co/spaces/AIStupidLevel/](https://huggingface.co/spaces/AIStupidLevel/)

*Last Updated: October 2025*
