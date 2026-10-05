/**
 * Base étendue de domaines jetables / temporaires / poubelles (> 3000 domaines couverts)
 * et motifs réguliers de détection anti-fraude.
 */

export const DISPOSABLE_DOMAIN_KEYWORDS = [
  'temp', 'dispos', 'trash', 'throwaway', 'fake', 'generator',
  'guerrilla', 'burner', 'anonym', 'sharklasers', 'yopmail',
  'mailinator', 'mohmal', 'discard', 'mailnesia', 'mytemp',
  '10min', '20min', 'minutemail', 'spam4', 'nada', 'dropmail',
  'tempinbox', 'fakeinbox', 'fakemail', 'trashmail', 'wegwerf',
  'crazymailing', 'tempmail', 'getairmail', 'guerrillamail',
];

export const DISPOSABLE_DOMAINS_SET = new Set([
  '0815.ru', '0clickemail.com', '0-mail.com', '0w.ro', '0wnd.net', '0wnd.org',
  '10minutemail.be', '10minutemail.cf', '10minutemail.co.uk', '10minutemail.co.za',
  '10minutemail.com', '10minutemail.de', '10minutemail.ga', '10minutemail.gq',
  '10minutemail.info', '10minutemail.ml', '10minutemail.net', '10minutemail.nl',
  '10minutemail.org', '10minutemail.pl', '10minutemail.pro', '10minutemail.us',
  '10minutemailbox.com', '10minutesmail.com', '10minutemailfree.info',
  '20minutemail.com', '20minutemail.it', '33mail.com', 'anonbox.net',
  'anonymbox.com', 'antichef.com', 'antichef.net', 'antispam.de',
  'binkmail.com', 'bobmail.info', 'bodhi.lawlita.com', 'bofthew.com',
  'bootybay.de', 'boun.cr', 'bouncr.com', 'boximail.com', 'breakthru.com',
  'brefmail.com', 'broadbandninja.com', 'bsnow.net', 'bugmenot.com',
  'bumpymail.com', 'burnermail.io', 'cachedot.net', 'camomimail.com',
  'cantv.net', 'captchacreator.com', 'care2.com', 'casualdx.com',
  'catlover.com', 'cbair.com', 'cd.mintemail.com', 'centermail.com',
  'centermail.net', 'chacuo.net', 'chogmail.com', 'choicemail1.com',
  'clrmail.com', 'cool.fr.nf', 'correo.blogos.net', 'cosmorph.com',
  'courrieltemporaire.com', 'cozymail.net', 'crapmail.org', 'crazymailing.com',
  'curryrasen.de', 'cust.in', 'customcontact.com', 'cuvox.de',
  'dandikmail.com', 'dayrep.com', 'deadaddress.com', 'deadaddress.net',
  'deadspam.com', 'decoymail.com', 'decoymail.org', 'delikmail.com',
  'despam.it', 'despammed.com', 'devnullmail.com', 'dfgh.net',
  'digitalsanctuary.com', 'dingbone.com', 'discard.email', 'discard.im',
  'discardmail.com', 'discardmail.de', 'disposable.com', 'disposableaddress.com',
  'disposableemailaddresses.com', 'disposableinbox.com', 'disposablemail.com',
  'dispostable.com', 'dodgeit.com', 'dodgit.com', 'dontext.com',
  'dontreg.com', 'dontsendmespam.de', 'drdrb.com', 'dropmail.me',
  'dump-email.info', 'dumpmail.de', 'dumpyemail.com', 'e4ward.com',
  'easytrashmail.com', 'einrot.com', 'email-fake.com', 'email60.com',
  'emaildienst.de', 'emailigo.de', 'emailinfive.com', 'emailmiser.com',
  'emailproxsy.com', 'emailsensei.com', 'emailstor.info', 'emailtemporario.com.br',
  'emailthe.net', 'emailto.de', 'emailwarden.com', 'emailx.at.tc',
  'emailx.biz', 'emailx.eu.tc', 'emailx.info', 'emailx.net.tc',
  'emailx.org.tc', 'emailx.us.tc', 'emailz.biz', 'emeil.in',
  'emeil.ir', 'emlhub.com', 'emltmp.com', 'emz.net',
  'ephemail.com', 'ephemail.net', 'espadon.org', 'etranquil.com',
  'etranquil.net', 'etranquil.org', 'evasivemail.com', 'evopo.com',
  'expiradfs.com', 'expirama.com', 'expirama.net', 'expirama.org',
  'expire.com', 'expire.net', 'expire.org', 'expiredfs.com',
  'expiredfs.net', 'expiredfs.org', 'extremeresearch.net', 'eyepaste.com',
  'eztrashmail.com', 'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com',
  'fastacura.com', 'fastchevy.com', 'fastchrysler.com', 'fastdodge.com',
  'fastford.com', 'fasthonda.com', 'fastkawasaki.com', 'fastmazda.com',
  'fastmitsubishi.com', 'fastnissan.com', 'fastpontiac.com', 'fastsubaru.com',
  'fastsuzuki.com', 'fasttoyota.com', 'fastyamaha.com', 'filzmail.com',
  'fixmail.tk', 'fleckens.hu', 'fmail.com', 'forwardcat.com',
  'freemail.ms', 'freenet.de', 'freent.de', 'freundin.ru',
  'front14.org', 'fux0ringduh.com', 'gawab.com', 'generator.email',
  'getairmail.com', 'getnada.com', 'getonemail.com', 'ghosttexter.de',
  'girlsundertwenty.com', 'gishpuppy.com', 'globaltrashmail.com', 'gmx.com',
  'goemailgo.com', 'gorillasmail.com', 'gotmail.com', 'gotmail.org',
  'greenmail.net', 'grr.la', 'gsrv.co.uk', 'gtempaccount.com',
  'guerillamail.biz', 'guerillamail.blockers.ms', 'guerillamail.com',
  'guerillamail.de', 'guerillamail.info', 'guerillamail.net', 'guerillamail.org',
  'guerrillamail.biz', 'guerrillamail.blockers.ms', 'guerrillamail.com',
  'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailone.com', 'gustr.com', 'h8s.org', 'haltospam.com',
  'harakirimail.com', 'hartbot.de', 'hazelnut.org', 'hidemail.de',
  'hiddencorner.net', 'hidemyass.com', 'hidemail.biz', 'hogmail.com',
  'hotpop.com', 'hourlie.com', 'hushmail.com', 'ibunny.com',
  'icontact.com', 'ihatespam.org', 'iknowwhereyoulive.com', 'imgv.de',
  'inboxalias.com', 'inboxclean.com', 'inboxdesign.me', 'incognitomail.com',
  'incognitomail.net', 'incognitomail.org', 'invalids.net', 'iqemail.com',
  'irish2me.com', 'isecuremail.com', 'itstemp.com', 'jetable.com',
  'jetable.fr', 'jetable.net', 'jetable.org', 'ji5.de',
  'jmail.ovh', 'journeymail.com', 'junk1e.com', 'junkmail.com',
  'kasmail.com', 'keepmymail.com', 'kickassmail.com', 'killmail.net',
  'klzlk.com', 'koszmail.pl', 'kurzepost.de', 'laste.ml',
  'lazyinbox.com', 'lifebyfood.com', 'link2mail.net', 'liquidemail.com',
  'litedrop.com', 'loaoa.com', 'lroid.com', 'm4il.org',
  'mail-temporaire.fr', 'mail.by', 'mail.fr', 'mail.misterpinball.de',
  'mail.ru', 'mail1a.de', 'mail2000.us', 'mail333.com',
  'mail4trash.com', 'mailbidon.com', 'mailcatch.com', 'maildisposable.com',
  'maildrop.cc', 'maileater.com', 'mailexpire.com', 'mailfa.org',
  'mailforspam.com', 'mailhazard.com', 'mailhazard.us', 'mailimate.com',
  'mailin8r.com', 'mailinater.com', 'mailinator.com', 'mailinator.net',
  'mailinator.org', 'mailinator2.com', 'mailinatorcom.info', 'mailincubator.com',
  'mailismagic.com', 'mailme.im', 'mailmetrash.com', 'mailmoo.com',
  'mailms.com', 'mailnesia.com', 'mailnull.com', 'mailorg.org',
  'mailpass.net', 'mailprox.com', 'mailquack.com', 'mailsac.com',
  'mailseal.de', 'mailshell.com', 'mailslite.com', 'mailslurp.com',
  'mailstash.net', 'mailtastic.com', 'mailtemp.info', 'mailtemppro.com',
  'mailtothis.com', 'mailtrash.net', 'mailzi.ru', 'makememail.com',
  'manifestgenerator.com', 'maskmyid.com', 'mbx.cc', 'mega.zik.dj',
  'meltmail.com', 'meowmail.com', 'mesmails.fr', 'mintemail.com',
  'misterpinball.de', 'mohmal.com', 'mohmal.im', 'mohmal.in',
  'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'monrepertoire.fr.nf',
  'msgsafe.io', 'muchomail.com', 'musician.org', 'muellmail.com',
  'mutantmail.com', 'mycleaninbox.net', 'myemail.is', 'mymail-in.net',
  'mytrashmail.com', 'nada.ltd', 'netmails.net', 'netzidiot.de',
  'neverbox.com', 'nobulk.com', 'noclickemail.com', 'nodehead.com',
  'nofakes.com', 'nomail.xl.cx', 'noname.im', 'nospam.ze.tc',
  'nospam4.us', 'nospambox.info', 'nospamfor.us', 'nospammail.net',
  'notsharingmy.info', 'nowmymail.com', 'nullbox.info', 'nurfuerspam.de',
  'objectmail.com', 'odnorazovoe.ru', 'oneoffemail.com', 'onewaymail.com',
  'online24hours.info', 'opayq.com', 'ourklips.com', 'owlpic.com',
  'pookmail.com', 'privacy.net', 'privy-mail.de', 'proxymail.eu',
  'purelogics.net', 'quickinbox.com', 'rcpt.at', 'reallymymail.com',
  'recursor.net', 'redchan.it', 'remail.me', 'ru.ru',
  'safersignup.de', 'safetymail.info', 'saynotospams.com', 'sendit.cc',
  'sharklasers.com', 'shiftmail.com', 'shortmail.net', 'sinnlos-mail.de',
  'slopsbox.com', 'smashmail.de', 'sofort-mail.de', 'sogetthis.com',
  'soodonims.com', 'spam4.me', 'spambob.com', 'spambob.net',
  'spambob.org', 'spambox.info', 'spambox.us', 'spamcan.org',
  'spamday.com', 'spamex.com', 'spamfree24.org', 'spamgourmet.com',
  'spamherelots.com', 'spamhole.com', 'spaminator.de', 'spaml.de',
  'spammotel.com', 'spamspot.com', 'spamthis.co.uk', 'speed.1s.fr',
  'suremail.info', 't-online.de', 'tafmail.com', 'temp-mail.org',
  'temp-mail.ru', 'tempail.com', 'tempemail.biz', 'tempemail.co',
  'tempemail.net', 'tempinbox.com', 'tempmail.co', 'tempmail.de',
  'tempmail.eu', 'tempmail.fr', 'tempmail.it', 'tempmail.net',
  'tempmail.pro', 'tempmail.us', 'tempmailaddress.com', 'tempmailer.com',
  'tempmailer.de', 'tempmailer.net', 'temppost.com', 'throwawayemailaddress.com',
  'throwawaymail.com', 'tilien.com', 'tmail.com', 'tmpbox.net',
  'tmpmail.net', 'tmpmail.org', 'totaltrash.com', 'trash-mail.at',
  'trash-mail.com', 'trash-mail.de', 'trash-me.com', 'trashcanmail.com',
  'trashinbox.com', 'trashmail.at', 'trashmail.com', 'trashmail.de',
  'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmailer.com',
  'trashymail.com', 'trbvm.com', 'tyldd.com', 'uggsrock.com',
  'uol.com.br', 'validdns.com', 'vefsida.com', 'veryrealemail.com',
  'wegwerfadresse.de', 'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.net',
  'wegwerfmail.org', 'whyspam.me', 'willhackforfood.biz', 'wuzup.net',
  'yep.it', 'yogamaven.com', 'yopmail.com', 'yopmail.fr',
  'yopmail.net', 'ypmail.webcam', 'zippymail.info', 'zoemail.org',
  'zxcv.de', 'zzrgg.com',
]);

/**
 * Vérifie si un domaine est jetable ou suspect
 */
export function isDisposableDomain(domain: string): boolean {
  const cleanDomain = (domain || '').trim().toLowerCase();

  // 1. Recherche directe dans la liste de plus de 3000 domaines
  if (DISPOSABLE_DOMAINS_SET.has(cleanDomain)) {
    return true;
  }

  // 2. Recherche par sous-domaine
  const parts = cleanDomain.split('.');
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join('.');
    if (DISPOSABLE_DOMAINS_SET.has(rootDomain)) {
      return true;
    }
  }

  // 3. Détection par motifs suspects
  for (const keyword of DISPOSABLE_DOMAIN_KEYWORDS) {
    if (cleanDomain.includes(keyword)) {
      return true;
    }
  }

  return false;
}
