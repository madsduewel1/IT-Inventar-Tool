// src/mail/outgoing/mailWorker.ts
import { Worker, Job } from "bullmq";
import nodemailer from "nodemailer";
import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import config from "../../config/index";
import { MailJobData } from "./types";

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

// Helper to load and compile a Handlebars template
function loadTemplate(templateName: string): Handlebars.TemplateDelegate {
  const templatePath = path.resolve(__dirname, "templates", `${templateName}.hbs`);
  const source = fs.readFileSync(templatePath, "utf8");
  return Handlebars.compile(source);
}

const mailWorker = new Worker("mailQueue", async (job: Job<MailJobData>) => {
  const { to, subject, templateName, context, attachments } = job.data;

  // Compile HTML body
  const template = loadTemplate(templateName);
  const html = template(context);

  // Generate plain text fallback (strip HTML tags)
  const plainText = html.replace(/<[^>]+>/g, "");

  const mailOptions: nodemailer.SendMailOptions = {
    from: config.smtp.from,
    to,
    subject,
    html,
    text: plainText,
    attachments,
  };

  await transporter.sendMail(mailOptions);

  // TODO: log the sent mail to DB or a file (not implemented here)
}, {
  connection: config.redis.url,
  // Retry with exponential back‑off, max 5 attempts
  settings: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

mailWorker.on("failed", (job, err) => {
  console.error(`Mail job ${job?.id} failed:`, err);
});

export default mailWorker;
