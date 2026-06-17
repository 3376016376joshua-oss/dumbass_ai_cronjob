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
- Schedule: `0 2 * * *` UTC, which is 10:00 in Asia/Shanghai

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
