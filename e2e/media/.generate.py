"""Generate portable non-speech CI fallbacks. No TTS or external source material."""
import math
import struct
import wave
from pathlib import Path

root = Path(__file__).parent / 'tones'
root.mkdir(exist_ok=True)
for name, seconds, hz in [('field-notes-episode-01.wav', 12.35025, 440), ('glass-orchard-chapter-01.wav', 13.883375, 330), ('boundary-book-1.wav', 4, 330), ('boundary-book-2.wav', 5, 440), ('boundary-book-3.wav', 6, 550)]:
	with wave.open(str(root / name), 'wb') as audio:
		audio.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
		audio.writeframes(b''.join(struct.pack('<h', int(900 * math.sin(2 * math.pi * hz * n / 8000))) for n in range(round(seconds * 8000))))
