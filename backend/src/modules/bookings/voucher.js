'use strict';

const PDFDocument = require('pdfkit');

const formatDateTime = (value) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));

/** Renders a booking voucher PDF (built-in fonts only; no external resources). */
function renderVoucher({ booking, travelers }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Voucher ${booking.booking_reference}` } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Jharkhand Eco & Cultural Tourism', { align: 'left' });
    doc.moveDown(0.3).fontSize(14).fillColor('#2f6f4e').text('Booking voucher').fillColor('black');
    doc.moveDown();
    const row = (label, value) => doc.fontSize(11).font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(String(value));
    row('Booking reference', booking.booking_reference);
    row('Status', booking.booking_status);
    row('Service', booking.description_snapshot);
    row('Starts', formatDateTime(booking.service_start_at));
    row('Ends', formatDateTime(booking.service_end_at));
    row('Amount paid', `${booking.currency} ${booking.total_amount}`);
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Travellers');
    doc.font('Helvetica').fontSize(11);
    for (const traveler of travelers) doc.text(`- ${traveler.full_name}${traveler.is_primary ? ' (primary contact)' : ''}`);
    doc.moveDown();
    const policy = booking.booking_details.cancellationPolicy?.tiers ?? [];
    if (policy.length) {
      doc.fontSize(12).font('Helvetica-Bold').text('Cancellation policy');
      doc.font('Helvetica').fontSize(10);
      for (const tier of [...policy].sort((a, b) => b.hoursBeforeCheckIn - a.hoursBeforeCheckIn)) {
        doc.text(`- ${tier.hoursBeforeCheckIn} h or more before start: ${tier.refundPercent}% refund`);
      }
    }
    doc.moveDown(2).fontSize(9).fillColor('#6b7280').text('Present this voucher (printed or on your phone) with a valid photo ID at check-in.');
    doc.end();
  });
}

module.exports = { renderVoucher };
