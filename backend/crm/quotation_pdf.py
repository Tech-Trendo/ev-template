"""Render a quotation as a printable PDF with generic, replaceable letterhead branding."""

from io import BytesIO
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Quotation

_WIDTH, _HEIGHT = A4


def _fmt_npr(amount) -> str:
    """Format currency in Indian/Nepali style: 84,00,000."""
    try:
        val = int(round(float(amount)))
    except (TypeError, ValueError):
        val = 0
    neg = val < 0
    n = abs(val)
    s = str(n)
    if len(s) <= 3:
        res = s
    else:
        last3 = s[-3:]
        rem = s[:-3]
        parts = []
        while len(rem) > 2:
            parts.insert(0, rem[-2:])
            rem = rem[:-2]
        if rem:
            parts.insert(0, rem)
        parts.append(last3)
        res = ",".join(parts)
    return f"-{res}" if neg else res


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ExactTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=15,
        alignment=1,  # Center
        textColor=colors.HexColor("#00A7E1"),
        spaceAfter=0,
    ))
    styles.add(ParagraphStyle(
        name="ExactDocId",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=15,
        textColor=colors.HexColor("#0B3D2B"),
    ))
    styles.add(ParagraphStyle(
        name="ExactMetaRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        alignment=2,  # Right
        textColor=colors.HexColor("#1F2937"),
    ))
    styles.add(ParagraphStyle(
        name="ExactCellLeft",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1F2937"),
    ))
    styles.add(ParagraphStyle(
        name="ExactCellRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        alignment=2,  # Right
        textColor=colors.HexColor("#1F2937"),
    ))
    styles.add(ParagraphStyle(
        name="ExactSpecs",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor("#1F2937"),
    ))
    styles.add(ParagraphStyle(
        name="ExactAccount",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#111827"),
    ))
    styles.add(ParagraphStyle(
        name="ExactClosing",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor("#4B5563"),
    ))
    return styles


def build_quotation_pdf(quotation: Quotation, printed_by=None) -> bytes:
    """Return raw bytes of a printable quotation PDF."""
    buffer = BytesIO()

    # Exact page margins leaving room for top and bottom letterhead banners
    top_margin = 53 * mm
    bottom_margin = 27 * mm
    left_margin = 16 * mm
    right_margin = 16 * mm

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
    )
    s = _styles()
    story = []

    # 1. Green Title
    story.append(Paragraph("QUOTATION FOR COMMERCIAL ELECTRIC VEHICLES", s["ExactTitle"]))
    story.append(Spacer(1, 2.5 * mm))

    # 2. Quotation Ref/Display ID (left) and Dates (right)
    # Prefer Quotation / Reference No. over internal QT-####; append -R1/-R2 for revisions.
    disp_id = (getattr(quotation, "reference_no", "") or "").strip() or ""
    if disp_id:
        disp_id = re.sub(r"-R\d+$", "", disp_id, flags=re.IGNORECASE)
        rev = int(getattr(quotation, "revision_number", 0) or 0)
        if rev > 0:
            disp_id = f"{disp_id}-R{rev}"
    else:
        disp_id = quotation.display_id or f"QT-{quotation.id}"
    created_date = quotation.created_at.strftime("%Y-%m-%d") if getattr(quotation, "created_at", None) else ""
    valid_date = quotation.valid_until.strftime("%Y-%m-%d") if getattr(quotation, "valid_until", None) else "15 days from issue"

    meta_table = Table([
        [
            Paragraph(disp_id, s["ExactDocId"]),
            Paragraph(f"<b>Issue Date:</b> {created_date}<br/><b>Valid Until:</b> {valid_date}", s["ExactMetaRight"]),
        ]
    ], colWidths=[98 * mm, 80 * mm])
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, colors.HexColor("#D1D5DB")),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 2.5 * mm))

    # 3. Client Box (left) & Sales Details Box (right)
    client_name = quotation.company or quotation.resolved_customer_name
    pan = getattr(quotation, "pan_number", "") or (getattr(quotation.customer, "pan_vat_number", "") if quotation.customer else "")
    phone = getattr(quotation, "customer_phone", "") or (getattr(quotation.customer, "phone", "") if quotation.customer else "")
    address = (
        getattr(quotation, "customer_address", "")
        or (getattr(quotation.customer, "address", "") or getattr(quotation.customer, "location", "") if quotation.customer else "")
    )

    client_html_parts = [
        '<font size="7" color="#6B7280"><b>QUOTATION FOR</b></font>',
        f'<b><font size="9.5" color="#111827">{client_name}</font></b>',
    ]
    bank_name = (getattr(quotation, "bank_name", "") or "").strip()
    bank_branch = (getattr(quotation, "bank_address", "") or "").strip()
    if pan:
        client_html_parts.append(f'<font size="8" color="#374151">PAN No. {pan}</font>')
    if phone:
        client_html_parts.append(f'<font size="8" color="#374151">Mobile: {phone}</font>')
    if address:
        client_html_parts.append(f'<font size="8" color="#374151">Address: {address}</font>')
    if bank_name:
        client_html_parts.append(f'<font size="8" color="#374151">Bank: {bank_name}</font>')
    if bank_branch:
        client_html_parts.append(f'<font size="8" color="#374151">Branch: {bank_branch}</font>')

    sp_name = getattr(quotation, "resolved_salesperson_name", None) or quotation.salesperson or "EVOS"
    sp_phone = getattr(quotation, "resolved_salesperson_phone", None) or getattr(quotation, "salesperson_phone", "") or "+977 9765022801"
    sp_email = getattr(quotation, "resolved_salesperson_email", None) or getattr(quotation, "salesperson_email", "") or "info@evos.example.com"

    sales_html_parts = [
        '<font size="7" color="#6B7280"><b>SALES DETAILS</b></font>',
        f'<font size="8" color="#6B7280">Salesperson:</font> <b><font size="8" color="#111827">{sp_name}</font></b>',
        f'<font size="8" color="#6B7280">Mobile:</font> <font size="8" color="#111827">{sp_phone}</font>',
        f'<font size="8" color="#6B7280">Email:</font> <font size="8" color="#111827">{sp_email}</font>',
    ]

    parties_table = Table([
        [
            Paragraph("<br/>".join(client_html_parts), s["ExactCellLeft"]),
            Paragraph("<br/>".join(sales_html_parts), s["ExactCellRight"]),
        ]
    ], colWidths=[96 * mm, 82 * mm])
    parties_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1 * mm),
    ]))
    story.append(parties_table)
    story.append(Spacer(1, 2.5 * mm))

    # 4. Items Table
    v_name = quotation.vehicle or "VT Cargo 6T"
    if not v_name.upper().startswith("VT"):
        v_name = f"VT {v_name}"
    length_part = f" - {quotation.vehicle_length}" if getattr(quotation, "vehicle_length", "") else ""
    item_title = f"{v_name}{length_part} Commercial Electric Vehicle"

    qty = getattr(quotation, "quantity", 1) or 1
    base_price = float(quotation.vehicle_price or quotation.total + quotation.discount)
    discount_val = float(quotation.discount or 0)
    total_val = float(quotation.total) - float(quotation.accessories or 0)
    words_val = quotation.amount_in_words

    table_data = [
        [
            Paragraph('<font size="7" color="#6B7280"><b>ITEM</b></font>', s["ExactCellLeft"]),
            Paragraph('<font size="7" color="#6B7280"><b>QTY</b></font>', s["ExactTitle"]),
            Paragraph('<font size="7" color="#6B7280"><b>PRICE</b></font>', s["ExactCellRight"]),
        ],
        [
            Paragraph(f'<b><font size="8.5" color="#111827">{item_title}</font></b>', s["ExactCellLeft"]),
            Paragraph(f'<b><font size="8.5" color="#111827">{qty}</font></b>', s["ExactTitle"]),
            Paragraph(f'<b><font size="8.5" color="#111827">{_fmt_npr(base_price)}</font></b>', s["ExactCellRight"]),
        ],
    ]

    if float(quotation.other_charges or 0) > 0:
        table_data.append([
            Paragraph('<font size="8" color="#374151">Other Charges</font>', s["ExactCellLeft"]),
            Paragraph('<font size="8" color="#374151">1</font>', s["ExactTitle"]),
            Paragraph(f'<b><font size="8" color="#374151">{_fmt_npr(quotation.other_charges)}</font></b>', s["ExactCellRight"]),
        ])

    if discount_val > 0:
        table_data.append([
            Paragraph("", s["ExactCellLeft"]),
            Paragraph('<font size="8" color="#6B7280">Discount</font>', s["ExactCellRight"]),
            Paragraph(f'<b><font size="8" color="#111827">{_fmt_npr(discount_val)}</font></b>', s["ExactCellRight"]),
        ])

    table_data.append([
        Paragraph(f'<b><font size="8.5" color="#111827">AMOUNT IN WORDS: {words_val}</font></b>', s["ExactCellLeft"]),
        Paragraph('<b><font size="8.5" color="#111827">TOTAL</font></b>', s["ExactCellRight"]),
        Paragraph(f'<b><font size="9.5" color="#111827">{_fmt_npr(total_val)}</font></b>', s["ExactCellRight"]),
    ])

    items_table = Table(table_data, colWidths=[106 * mm, 24 * mm, 48 * mm])
    items_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2 * mm),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#D1D5DB")),
        ("LINEBELOW", (0, 1), (-1, 1), 0.5, colors.HexColor("#E5E7EB")),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.HexColor("#D1D5DB")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, colors.HexColor("#D1D5DB")),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 2.5 * mm))

    # 5. Vehicle Specifications (left) & Terms & Conditions (right)
    spec_model = quotation.vehicle or "VT Cargo 6T"
    spec_desc = getattr(quotation, "vehicle_description", "") or "6 Ton Payload with 2 Doors"
    spec_batt = getattr(quotation, "battery_capacity", "") or "CATL, 100.07 kWh"
    spec_trans = getattr(quotation, "transmission", "") or "Automatic"
    spec_var = getattr(quotation.variant, "name", "") if getattr(quotation, "variant", None) else "Container"
    spec_len = getattr(quotation, "vehicle_length", "") or "16 FT"
    from .models import catalog_range_for_model

    spec_range = catalog_range_for_model(getattr(quotation, "vehicle_model", None)) or getattr(quotation, "range_km", "") or ""
    spec_ver = getattr(quotation, "version", "") or "Commercial Electric Truck"
    spec_chg = getattr(quotation, "charger_info", "") or "Support GB/T DC Fast Charger"

    specs_html = (
        '<b><font size="8" color="#0B3D2B">VEHICLE\'S SPECIFICATIONS:</font></b><br/>'
        f'&bull; <b>Model :</b> {spec_model}<br/>'
        f'&bull; <b>Description :</b> {spec_desc}<br/>'
        f'&bull; <b>Battery :</b> {spec_batt}<br/>'
        f'&bull; <b>Transmission :</b> {spec_trans}<br/>'
        f'&bull; <b>Variant Type :</b> {spec_var}<br/>'
        f'&bull; <b>Cargo Length :</b> {spec_len}<br/>'
        f'&bull; <b>Range :</b> {spec_range}<br/>'
        f'&bull; <b>Version :</b> {spec_ver}<br/>'
        f'&bull; <b>Charger :</b> {spec_chg}'
    )
    for row in getattr(quotation, "extra_specs", None) or []:
        if not isinstance(row, dict):
            continue
        label = str(row.get("label") or "").strip()
        value = str(row.get("value") or "").strip()
        if label or value:
            specs_html += f'<br/>&bull; <b>{label} :</b> {value}'

    t_payment = getattr(quotation, "payment_terms", "") or "40% Down Payment & 60% Bank DO before Dispatch."
    t_deliv = getattr(quotation, "delivery_terms", "") or "As per Client Requirement."
    t_warr = getattr(quotation, "warranty_terms", "") or "Company Authorized Warranty Terms."
    t_valid = getattr(quotation, "valid_until", None)
    t_valid_str = f"Valid until {t_valid.strftime('%Y-%m-%d')}." if t_valid else "15 days from the date of quotation sent."
    t_ins = getattr(quotation, "insurance_terms", "") or "1 Year Insurance Included in Offered Price."
    t_reg = getattr(quotation, "registration_terms", "") or "1 Year Registration Included in Offered Price."

    terms_html = (
        '<b><font size="8" color="#0B3D2B">TERMS &amp; CONDITION:</font></b><br/>'
        '&bull; <b>VAT :</b> Price is Inclusive of 13% VAT.<br/>'
        f'&bull; <b>Payment Terms :</b> {t_payment}<br/>'
        f'&bull; <b>Delivery :</b> {t_deliv}<br/>'
        f'&bull; <b>Warranty :</b> {t_warr}<br/>'
        f'&bull; <b>Validity :</b> {t_valid_str}<br/>'
        f'&bull; <b>Insurance :</b> {t_ins}<br/>'
        f'&bull; <b>Registration :</b> {t_reg}'
    )

    specs_terms_table = Table([
        [
            Paragraph(specs_html, s["ExactSpecs"]),
            Paragraph(terms_html, s["ExactSpecs"]),
        ]
    ], colWidths=[89 * mm, 89 * mm])
    specs_terms_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(specs_terms_table)
    if (quotation.notes):
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            f"<b>Notes:</b> {quotation.notes.replace(chr(10), '<br/>')}",
            s["ExactCellLeft"],
        ))
    story.append(Spacer(1, 2.5 * mm))

    # 6. Bottom Section: Account Details (left) & Authorized Stamp/Signature (right)
    bank_name = getattr(quotation, "bank_name", "") or "YOUR BANK NAME"
    bank_address = getattr(quotation, "bank_address", "") or "YOUR BRANCH"
    account_html = (
        '<u><b><font size="7.5" color="#111827">ACCOUNT DETAILS:</font></b></u><br/>'
        '<b>EV OS</b><br/>'
        f'<b>{bank_name}</b><br/>'
        f'<b>{bank_address}</b><br/>'
        '<b>A/C NO: 000000000000</b>'
    )
    closing_html = (
        'We hope this quotation meets your requirements.<br/>'
        'Please feel free to contact us for any further clarifications.'
    )

    left_bottom = [
        Paragraph(account_html, s["ExactAccount"]),
        Spacer(1, 2.5 * mm),
        Paragraph(closing_html, s["ExactClosing"]),
    ]

    sig_elem = Paragraph(
        '<b>Authorized Signature</b><br/><b>EV OS</b>',
        s["ExactCellRight"],
    )

    bottom_table = Table([
        [
            left_bottom,
            sig_elem,
        ]
    ], colWidths=[126 * mm, 52 * mm])
    bottom_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(bottom_table)

    # Text-only letterhead so the template carries no third-party brand artwork.
    def _page_decorator(canvas, _doc):
        canvas.saveState()

        # Watermark
        canvas.saveState()
        canvas.setFillAlpha(0.06)
        canvas.setFillColor(colors.HexColor("#0B3D2B"))
        canvas.setFont("Helvetica-Bold", 44)
        canvas.drawCentredString(_WIDTH / 2.0, _HEIGHT / 2.0 - 10 * mm, "EV OS")
        canvas.restoreState()

        # Top header
        canvas.setFillColor(colors.HexColor("#0B3D2B"))
        canvas.rect(0, _HEIGHT - 4 * mm, _WIDTH, 4 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.HexColor("#10B981"))
        canvas.rect(left_margin, _HEIGHT - 16 * mm, 10 * mm, 8 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawCentredString(left_margin + 5 * mm, _HEIGHT - 13.5 * mm, "EV")
        canvas.setFillColor(colors.HexColor("#0B3D2B"))
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(left_margin + 13 * mm, _HEIGHT - 13 * mm, "EV OS")
        canvas.setFillColor(colors.HexColor("#4B5563"))
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(
            _WIDTH - left_margin,
            _HEIGHT - 11 * mm,
            "Commercial Vehicle Sales & Fleet Solutions",
        )
        canvas.drawRightString(
            _WIDTH - left_margin,
            _HEIGHT - 15 * mm,
            "Your Address, Your City  |  info@yourcompany.com",
        )

        # Bottom footer
        canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
        canvas.setLineWidth(0.5)
        canvas.line(
            left_margin,
            bottom_margin - 4 * mm,
            _WIDTH - left_margin,
            bottom_margin - 4 * mm,
        )
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.setFont("Helvetica", 7)
        canvas.drawString(left_margin, bottom_margin - 9 * mm, "EV OS - Quotation")
        canvas.drawRightString(_WIDTH - left_margin, bottom_margin - 9 * mm, "info@yourcompany.com")

        canvas.restoreState()

    doc.build(story, onFirstPage=_page_decorator, onLaterPages=_page_decorator)
    return buffer.getvalue()
