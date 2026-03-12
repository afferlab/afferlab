#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import struct
import zlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "docs" / "testing" / "fixtures"


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_pdf(path: Path, pages: list[str], include_image_on_second: bool = False) -> None:
    objects: list[bytes] = []

    page_obj_numbers: list[int] = []
    content_obj_numbers: list[int] = []

    font_obj_no = 3 + len(pages) * 2
    image_obj_no = font_obj_no + 1 if include_image_on_second and len(pages) >= 2 else None

    kids_refs = []
    next_obj_no = 3
    for _ in pages:
        page_obj_numbers.append(next_obj_no)
        content_obj_numbers.append(next_obj_no + 1)
        kids_refs.append(f"{next_obj_no} 0 R")
        next_obj_no += 2

    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{' '.join(kids_refs)}] /Count {len(pages)} >>".encode("utf-8"))

    for i, text in enumerate(pages):
        page_no = page_obj_numbers[i]
        content_no = content_obj_numbers[i]

        text_escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content_lines = [
            "BT",
            "/F1 13 Tf",
            "48 760 Td",
            f"({text_escaped}) Tj",
            "ET",
        ]

        if image_obj_no is not None and i == 1:
            content_lines.extend([
                "q",
                "100 0 0 100 48 620 cm",
                "/Im1 Do",
                "Q",
                "BT",
                "/F1 11 Tf",
                "48 600 Td",
                "(This page includes an embedded image object.) Tj",
                "ET",
            ])

        content_stream = "\n".join(content_lines).encode("utf-8")
        content_obj = b"<< /Length " + str(len(content_stream)).encode("ascii") + b" >>\nstream\n" + content_stream + b"\nendstream"

        resources = f"<< /Font << /F1 {font_obj_no} 0 R >>"
        if image_obj_no is not None and i == 1:
            resources += f" /XObject << /Im1 {image_obj_no} 0 R >>"
        resources += " >>"

        page_obj = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources {resources} /Contents {content_no} 0 R >>"
        ).encode("utf-8")

        objects.append(page_obj)
        objects.append(content_obj)

    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    if image_obj_no is not None:
        image_data = bytes([255, 0, 0])
        image_obj = (
            b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 "
            b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n"
            + image_data
            + b"\nendstream"
        )
        objects.append(image_obj)

    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(pdf.tell())
        pdf.write(f"{i} 0 obj\n".encode("ascii"))
        pdf.write(obj)
        pdf.write(b"\nendobj\n")

    xref_start = pdf.tell()
    pdf.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.write(f"{offset:010d} 00000 n \n".encode("ascii"))

    pdf.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF\n"
        ).encode("ascii")
    )

    write_bytes(path, pdf.getvalue())


def make_docx(path: Path) -> None:
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
""".strip()

    rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
""".strip()

    document = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Sample DOCX Fixture</w:t></w:r></w:p>
    <w:p><w:r><w:t>This file is used for Looma attachment regression tests.</w:t></w:r></w:p>
    <w:p><w:r><w:t>It contains a title and a few paragraphs.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
""".strip()

    with ZipFile(path, "w", ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document)


def make_xlsx(path: Path) -> None:
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
""".strip()

    rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
""".strip()

    workbook = """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Data" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>
""".strip()

    workbook_rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
""".strip()

    styles = """<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf xfId="0"/></cellXfs>
</styleSheet>
""".strip()

    sheet1 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Metric</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Value</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Rows</t></is></c>
      <c r="B2"><v>10</v></c>
    </row>
  </sheetData>
</worksheet>
""".strip()

    sheet2 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>id</t></is></c>
      <c r="B1" t="inlineStr"><is><t>name</t></is></c>
    </row>
    <row r="2">
      <c r="A2"><v>1</v></c>
      <c r="B2" t="inlineStr"><is><t>Alice</t></is></c>
    </row>
    <row r="3">
      <c r="A3"><v>2</v></c>
      <c r="B3" t="inlineStr"><is><t>Bob</t></is></c>
    </row>
  </sheetData>
</worksheet>
""".strip()

    with ZipFile(path, "w", ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        zf.writestr("xl/styles.xml", styles)
        zf.writestr("xl/worksheets/sheet1.xml", sheet1)
        zf.writestr("xl/worksheets/sheet2.xml", sheet2)


def make_png(path: Path) -> None:
    # 64x40 PNG with a simple two-color pattern, generated without external deps.
    width, height = 64, 40
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            if (x // 8 + y // 8) % 2 == 0:
                raw.extend((20, 120, 220))
            else:
                raw.extend((240, 240, 245))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    write_bytes(path, png)


def make_jpg(path: Path) -> None:
    jpg_base64 = (
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PDw8PDw8PDw8QFREWFhURFRUYHSggGBol"
        "GxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t"
        "LS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAgMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAA"
        "AQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEh/9oADAMBAAIQAxAAAAHhAP/EABQQAQAAAAAAAAAAAAAAAAAA"
        "ACD/2gAIAQEAAQUCcf/EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8BJ//EABQRAQAAAAAAAAAAAAAAAAAA"
        "ACD/2gAIAQIBAT8BJ//Z"
    )
    write_bytes(path, base64.b64decode(jpg_base64))


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)

    build_pdf(FIXTURES / "tiny.pdf", ["Tiny PDF fixture for Looma attachment tests."])
    build_pdf(
        FIXTURES / "mixed.pdf",
        [
            "Mixed PDF fixture page 1: text content.",
            "Mixed PDF fixture page 2: text and image object.",
        ],
        include_image_on_second=True,
    )

    make_docx(FIXTURES / "sample.docx")
    make_xlsx(FIXTURES / "sample.xlsx")

    write_text(
        FIXTURES / "sample.csv",
        "id,name,score\n1,Alice,91\n2,Bob,87\n3,Carol,95\n4,Dan,83\n",
    )
    write_text(
        FIXTURES / "sample.txt",
        "Looma attachment regression fixture.\n\nThis is plain text with multiple paragraphs.\n",
    )
    write_text(
        FIXTURES / "sample.md",
        "# Sample Markdown\n\n- item one\n- item two\n\n```ts\nconsole.log('fixture')\n```\n",
    )

    make_png(FIXTURES / "sample.png")
    make_jpg(FIXTURES / "sample.jpg")

    print(f"Generated fixtures in: {FIXTURES}")


if __name__ == "__main__":
    main()
