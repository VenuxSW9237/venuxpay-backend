import { createApp } from "./app";
import { env, assertProductionEnv } from "./lib/env";

assertProductionEnv();

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`VenuxPay API listening on port ${env.port} [${env.nodeEnv}]`);
});

// ---------- Optional: keep a Render free-tier web service awake ----------
// Render's free plan spins a service down after 15 minutes with no inbound
// traffic. Setting SELF_PING_URL to this service's own public URL makes it
// ping its own /health endpoint every 10 minutes, which counts as inbound
// traffic and resets that timer — so it never goes idle long enough to sleep.
//
// This is a workaround, not a guarantee (Render can still restart/redeploy
// the instance, which briefly interrupts service either way). For a live
// product handling real money, an always-on paid instance is the more
// reliable option — cold starts mid-transaction are a bad experience.
// See the Go-Live Guide for both options.
if (env.selfPingUrl) {
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes, safely under Render's 15-minute idle window
  setInterval(() => {
    fetch(`${env.selfPingUrl}/health`).catch(() => {
      // Network hiccups here are expected occasionally and not worth logging noisily.
    });
  }, PING_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log(`Self-ping enabled: pinging ${env.selfPingUrl}/health every 10 minutes`);
}
