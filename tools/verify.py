"""Check actual PCM pulse onsets, rather than only the generating schedule."""
from array import array
from pathlib import Path
import wave

root = Path(__file__).resolve().parents[1]
with wave.open(str(root / 'audio/marching.wav')) as f:
    rate = f.getframerate()
    assert (f.getnchannels(), f.getsampwidth(), rate) == (1, 2, 8000)
    assert f.getnframes() == 186 * rate
    samples = array('h', f.readframes(f.getnframes()))

onsets = []
last = -rate
for index, sample in enumerate(samples):
    if abs(sample) > 250:
        if index - last > 0.04 * rate:
            onsets.append(index / rate)
        last = index

expected = [2, 3, 4]
expected += [5 + i for i in range(30)]
expected += [35 + i * 2 / 3 for i in range(180)]
expected += [155 + i for i in range(30)]
expected += [185, 185.3]
assert len(onsets) == len(expected) == 245, len(onsets)
error = max(abs(a - b) for a, b in zip(onsets, expected))
assert error < 0.002, error
assert all((root / p).is_file() for p in ['index.html', 'style.css', 'app.js', 'audio/test.wav'])
print(f'PASS: 186 s audio; 240 exercise beats; every pulse onset within {error * 1000:.3f} ms.')
