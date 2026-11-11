// Runs in the browser before the app starts: error monitoring for client code.
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/monitoring/sentry";

Sentry.init(sentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
