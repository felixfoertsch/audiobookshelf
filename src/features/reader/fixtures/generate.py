"""Generate original, local-only reader smoke fixtures: python3 generate.py OUTPUT_DIR."""
import base64
import pathlib
import sys
import zipfile

out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out / "reader.epub", "w") as book:
    book.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    book.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    book.writestr("book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">original-reader-test</dc:identifier><dc:title>Original reader test</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>')
    book.writestr("nav.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">First chapter</a></li><li><a href="two.xhtml">Second chapter</a></li></ol></nav></body></html>')
    for name, text in [("one", "First chapter. Searchable amber fox."), ("two", "Second chapter. Searchable cobalt bird.")]:
        book.writestr(name + ".xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Reader test</title></head><body><h1>' + name + '</h1>' + ("<p>" + text + "</p>") * 50 + '</body></html>')
with zipfile.ZipFile(out / "reader.cbz", "w") as comic:
    image = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0u0AAAAASUVORK5CYII=")
    for name in ["pages/page10.png", "pages/page2.png", "cover.png"]:
        comic.writestr(name, image)
    comic.writestr("ComicInfo.xml", "<ComicInfo><Title>Original comic test</Title><Writer>Fixture author</Writer></ComicInfo>")
objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
for text in ["Original PDF page one", "Original PDF page two"]:
    stream = f"BT /F1 16 Tf 20 200 Td ({text}) Tj ET".encode()
    objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
pdf = bytearray(b"%PDF-1.4\n")
offsets = [0]
for index, obj in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
xref = len(pdf)
pdf.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
for offset in offsets[1:]:
    pdf.extend(f"{offset:010d} 00000 n \n".encode())
pdf.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
(out / "reader.pdf").write_bytes(pdf)
print("Generated reader.epub, reader.cbz, reader.pdf")

# Original uncompressed PalmDB/MOBI records; sentinel record bounds text.
import struct
def mobi(name, html):
    text = html.encode()
    pdb = bytearray(78 + 3 * 8)
    pdb[:11] = b"Reader test"
    pdb[60:68] = b"BOOKMOBI"
    struct.pack_into(">H", pdb, 76, 3)
    record0 = len(pdb)
    header = bytearray(16 + 232)
    struct.pack_into(">HHIHHHH", header, 0, 1, 0, len(text), 1, 4096, 0, 0)
    header[16:20] = b"MOBI"
    struct.pack_into(">I", header, 20, 232)
    struct.pack_into(">I", header, 16 + 92, 99)
    for index, offset in enumerate([record0, record0 + len(header), record0 + len(header) + len(text)]):
        struct.pack_into(">II", pdb, 78 + index * 8, offset, index)
    (out / name).write_bytes(pdb + header + text)
mobi("reader-broken.mobi", '<html><body><p>Malformed image fixture<img recindex="1"/></p></body></html>')
attack = '<img src="https://reader-attacker.invalid/image"/><iframe src="https://reader-attacker.invalid/frame"></iframe><script>fetch("https://reader-attacker.invalid/script")</script><p onclick="fetch(\'https://reader-attacker.invalid/event\')">Hostile fixture safe text</p>'
mobi("reader-hostile.mobi", '<html><body>' + attack.replace('<img src="https://reader-attacker.invalid/image"/>', '<video poster="https://reader-attacker.invalid/poster"></video>') + '</body></html>')
with zipfile.ZipFile(out / "reader.epub") as source, zipfile.ZipFile(out / "reader-hostile.epub", "w") as target:
    for entry in source.infolist():
        value = source.read(entry.filename)
        if entry.filename == "one.xhtml":
            value = value.replace(b"<body>", ("<body>" + attack).encode())
        target.writestr(entry, value)
