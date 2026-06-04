"""
generate_voices.py
------------------
Generates all 48 bundled voice announcement MP3 files for Packing Recorder.

Usage:
    pip install edge-tts
    python generate_voices.py

Output:
    voices/id/station1-armed.mp3  ... (24 Indonesian files)
    voices/en/station1-armed.mp3  ... (24 English files)
"""

import asyncio
import os
import edge_tts

# ─── Phrases ──────────────────────────────────────────────────────────────────

STATIONS_ID = ['Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam']
STATIONS_EN = ['One', 'Two', 'Three', 'Four', 'Five', 'Six']

STATES_ID = {
    'armed':      'menunggu',
    'recording':  'merekam',
    'saved':      'tersimpan',
    'cancelled':  'dibatalkan',
}

STATES_EN = {
    'armed':      'waiting',
    'recording':  'recording',
    'saved':      'saved',
    'cancelled':  'cancelled',
}

VOICE_ID = 'id-ID-GadisNeural'
VOICE_EN = 'en-US-JennyNeural'

# ─── Generator ────────────────────────────────────────────────────────────────

async def generate(text, voice, output_path):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    print(f'  ✓  {output_path}  →  "{text}"')

async def main():
    tasks = []

    # Indonesian
    os.makedirs('voices/id', exist_ok=True)
    for i, station_word in enumerate(STATIONS_ID, start=1):
        for state_key, state_word in STATES_ID.items():
            text = f'{station_word}, {state_word}'
            path = f'voices/id/station{i}-{state_key}.mp3'
            tasks.append(generate(text, VOICE_ID, path))

    # English
    os.makedirs('voices/en', exist_ok=True)
    for i, station_word in enumerate(STATIONS_EN, start=1):
        for state_key, state_word in STATES_EN.items():
            text = f'{station_word}, {state_word}'
            path = f'voices/en/station{i}-{state_key}.mp3'
            tasks.append(generate(text, VOICE_EN, path))

    print(f'Generating {len(tasks)} audio files...\n')
    # Run in batches of 8 to avoid overwhelming the API
    for i in range(0, len(tasks), 8):
        await asyncio.gather(*tasks[i:i+8])

    print(f'\nDone! {len(tasks)} files written to voices/id/ and voices/en/')

if __name__ == '__main__':
    asyncio.run(main())
