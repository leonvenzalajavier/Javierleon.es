const RECIPIENT = 'leonvenzalajavier@gmail.com';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function doGet(event) {
  const page = HtmlService.createTemplateFromFile('Index');
  page.sessionId = event.parameter.session_id || '';
  return page.evaluate()
    .setTitle('Sube tu programación | Javier León')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function checkOrder(sessionId) {
  const order = paidOrder_(sessionId);
  return { available: !PropertiesService.getScriptProperties().getProperty('sent:' + order.id) };
}

function sendProgramming(form) {
  const order = paidOrder_(form.sessionId);
  const file = validateWord_(form.programming);
  const specialty = String(form.specialty || '').trim().slice(0, 120);
  if (!specialty) throw new Error('Indica tu especialidad.');

  const properties = PropertiesService.getScriptProperties();
  const sentKey = 'sent:' + order.id;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (properties.getProperty(sentKey)) return;
    MailApp.sendEmail({
      to: RECIPIENT,
      replyTo: order.customer_details.email,
      subject: 'Nueva programación para corregir',
      body: 'Especialidad: ' + specialty +
        '\nCorreo del comprador: ' + order.customer_details.email +
        '\nReferencia de pago: ' + order.id,
      attachments: [file]
    });
    properties.setProperty(sentKey, new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

function paidOrder_(sessionId) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{20,160}$/.test(sessionId || '')) {
    throw new Error('Abre el enlace de subida desde la confirmación de Stripe.');
  }
  const settings = PropertiesService.getScriptProperties();
  const key = settings.getProperty('STRIPE_RESTRICTED_KEY');
  const paymentLink = settings.getProperty('STRIPE_REVISION_PAYMENT_LINK_ID');
  if (!key || !paymentLink) throw new Error('El servicio de subida aún no está disponible.');
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() === 404) throw new Error('No se ha encontrado el pago.');
  if (response.getResponseCode() !== 200) throw new Error('No se ha podido verificar el pago. Vuelve a intentarlo.');
  const order = JSON.parse(response.getContentText());
  if (order.payment_link !== paymentLink || order.mode !== 'payment' ||
      order.status !== 'complete' || order.payment_status !== 'paid' ||
      order.currency !== 'eur' || order.amount_subtotal !== 15000 ||
      !order.customer_details || !order.customer_details.email) {
    throw new Error('La subida estará disponible cuando se confirme el pago de la revisión.');
  }
  return order;
}

function validateWord_(file) {
  if (!file || typeof file.getBytes !== 'function') throw new Error('Selecciona un archivo Word.');
  const filename = file.getName();
  const extension = filename.match(/\.(docx?)$/i);
  const bytes = file.getBytes();
  if (!extension || bytes.length < 8 || bytes.length > MAX_FILE_BYTES) {
    throw new Error('Selecciona un Word (.doc o .docx) de hasta 10 MB.');
  }
  const signature = bytes.slice(0, 8).map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
  const isDocx = extension[1].toLowerCase() === 'docx';
  const valid = isDocx ? signature.startsWith('504b0304') : signature === 'd0cf11e0a1b11ae1';
  if (!valid) throw new Error('El archivo no coincide con el formato Word indicado.');
  return file;
}
