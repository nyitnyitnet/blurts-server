"use strict";
const { URL } = require("url");

const AppConstants = require("./app-constants");

const nodemailer = require("nodemailer");
const hbs = require("nodemailer-express-handlebars");

const HBSHelpers = require("./template-helpers/hbs-helpers");
const mozlog = require("./log");


const log = mozlog("email-utils");

const hbsOptions = {
  viewEngine: {
    extname: ".hbs",
    layoutsDir: __dirname + "/views/layouts",
    defaultLayout: "default_email",
    partialsDir: __dirname + "/views/partials",
    helpers: HBSHelpers,
  },
  viewPath: __dirname + "/views/layouts",
  extName: ".hbs",
};

// The SMTP transport object. This is initialized to a nodemailer transport
// object while reading SMTP credentials, or to a dummy function in debug mode.
let gTransporter;

const EmailUtils = {
  async init(smtpUrl = AppConstants.SMTP_URL) {

    // Allow a debug mode that will log JSON instead of sending emails.
    if (!smtpUrl) {
      log.info("smtpUrl-empty", { message: "EmailUtils will log a JSON response instead of sending emails." });
      gTransporter = nodemailer.createTransport({jsonTransport: true});
      return Promise.resolve(true);
    }

    gTransporter = nodemailer.createTransport(smtpUrl);
    const gTransporterVerification = await gTransporter.verify();
    gTransporter.use("compile", hbs(hbsOptions));
    return Promise.resolve(gTransporterVerification);
  },


  sendEmail(aRecipient, aSubject, aTemplate, aContext) {
    if (!gTransporter) {
      return Promise.reject("SMTP transport not initialized");
    }

    const emailContext = Object.assign({
      SERVER_URL: AppConstants.SERVER_URL,
    }, aContext);
    return new Promise((resolve, reject) => {
      const emailFrom = AppConstants.EMAIL_FROM;
      const mailOptions = {
        from: emailFrom,
        to: aRecipient,
        subject: aSubject,
        template: aTemplate,
        context: emailContext,
        headers: {
          "x-ses-configuration-set": AppConstants.SES_CONFIG_SET,
        },
      };

      gTransporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          reject(error);
          return;
        }
        if (gTransporter.transporter.name === "JSONTransport") {
          log.info("JSONTransport", { message: info.message.toString() });
        }
        resolve(info);
      });
    });
  },

  appendUtmParams(url, campaign, content) {
    const utmParameters = {
      utm_source: "fx-monitor-emails",
      utm_medium: "email",
      utm_campaign: campaign,
      utm_content: content,
    };
    for (const param in utmParameters) {
      url.searchParams.append(param, utmParameters[param]);
    }
    return url;
  },

  getScanAnotherEmailUrl(emailType) {
    let url = new URL(AppConstants.SERVER_URL);
    url = this.appendUtmParams(url, "scan-another-email", emailType);
    return url;
  },

  getVerificationUrl(subscriber) {
    let url = new URL(`${AppConstants.SERVER_URL}/user/verify`);
    url.searchParams.append("token", encodeURIComponent(subscriber.verification_token));
    url = this.appendUtmParams(url, "verified-subscribers", "account-verification-email");
    return url;
  },

  getUnsubscribeUrl(subscriber, emailType) {
    let url = new URL(`${AppConstants.SERVER_URL}/user/unsubscribe`);
    url.searchParams.append("token", encodeURIComponent(subscriber.verification_token));
    url.searchParams.append("hash", encodeURIComponent(subscriber.sha1));
    url = this.appendUtmParams(url, "unsubscribe", emailType);
    return url;
  },

  getShareByEmail(req) {
    const subject = encodeURIComponent(req.fluentFormat("share-by-email-subject"));
    const body = encodeURIComponent(req.fluentFormat("share-by-email-message"));

    return {
      "gmail" : {
        client: "Gmail",
        class: "gmail",
        href: `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`,
      },
      "yahoo" : {
        client: "Yahoo",
        class: "yahoo",
        href: `https://compose.mail.yahoo.com/?subject=${subject}&body=${body}`,
      },
      "outlook" : {
        client: "Outlook",
        class: "outlook",
        href: `https://outlook.live.com/owa/?path=/mail/action/compose&subject=${subject}&body=${body}`,
      },
      "default-email" : {
        client: req.fluentFormat("share-other"),
        class: "default-email-client",
        href: `mailto:?subject=${subject}&body=${body}`,
      },
    };
  },

};

module.exports = EmailUtils;
