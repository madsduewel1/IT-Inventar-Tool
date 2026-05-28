// src/mail/outgoing/types.ts
export interface MailJobData {
  to: string;
  subject: string;
  templateName: string; // name of Handlebars template without .hbs
  context: Record<string, any>; // variables for template
  attachments?: Array<{
    filename: string;
    path?: string; // file system path
    content?: Buffer; // raw content if not from file
    cid?: string; // Content-ID for inline images
  }>;
}
