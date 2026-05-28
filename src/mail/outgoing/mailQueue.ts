// src/mail/outgoing/mailQueue.ts
import { Queue } from "bullmq";
import { config } from "../../config/index";

export const mailQueue = new Queue("mailQueue", {
  connection: config.redis.url,
});
