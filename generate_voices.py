"""
generate_voices.py
------------------
Generates all bundled voice announcement MP3 files for Packing Recorder.

Usage:
    pip install edge-tts
    python generate_voices.py            # all files
    python generate_voices.py duplicate  # only one state

Output:
    voices/id/station1-armed.mp3       ... (30 Indonesian station files)
    voices/en/station1-armed.mp3       ... (30 English station files)
    voices/id/generic-recording.mp3    ... (4 Indonesian generic files)
    voices/en/generic-recording.mp3    ... (4 English generic files)

Generic files are used in single-station mode where the station number
is implicit. States: recording, saved, cancelled, duplicate (no 'armed'
— single-station mode has no armed/waiting state).
"""

import asyncio
import os
import sys
import edge_tts

# ─── Phrases ──────────────────────────────────────────────────────────────────

STATIONS_ID = ['Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam']
STATIONS_EN = ['One', 'Two', 'Three', 'Four', 'Five', 'Six']

STATES_ID = {
    'armed':      'menunggu',
    'recording':  'merekam',
    'saved':      'tersimpan',
    'cancelled':  'dibatalkan',
    'duplicate':  'duplikasi nomor',
}

STATES_EN = {
    'armed':      'waiting',
    'recording':  'recording',
    'saved':      'saved',
    'cancelled':  'cancelled',
    'duplicate':  'duplicated number',
}

# Generic (single-station) — no 'armed', single-station has no waiting state
GENERIC_STATES_ID = {
    'recording': 'merekam',
    'saved':     'tersimpan',
    'cancelled': 'dibatalkan',
    'duplicate': 'duplikasi nomor',
}

GENERIC_STATES_EN = {
    'recording': 'recording',
    'saved':     'saved',
    'cancelled': 'cancelled',
    'duplicate': 'duplicated number',
}

VOICE_ID = 'id-ID-GadisNeural'
VOICE_EN = 'en-US-JennyNeural'

# ─── Generator ────────────────────────────────────────────────────────────────

async def generate(text, voice, output_path):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    print(f'  OK  {output_path}  ->  "{text}"')

async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    tasks = []

    # Indonesian — per-station
    os.makedirs('voices/id', exist_ok=True)
    for i, station_word in enumerate(STATIONS_ID, start=1):
        for state_key, state_word in STATES_ID.items():
            if only and state_key != only:
                continue
            text = f'{station_word}, {state_word}'
            path = f'voices/id/station{i}-{state_key}.mp3'
            tasks.append(generate(text, VOICE_ID, path))

    # English — per-station
    os.makedirs('voices/en', exist_ok=True)
    for i, station_word in enumerate(STATIONS_EN, start=1):
        for state_key, state_word in STATES_EN.items():
            if only and state_key != only:
                continue
            text = f'{station_word}, {state_word}'
            path = f'voices/en/station{i}-{state_key}.mp3'
            tasks.append(generate(text, VOICE_EN, path))

    # Indonesian — generic (single-station mode)
    for state_key, state_word in GENERIC_STATES_ID.items():
        if only and state_key != only:
            continue
        path = f'voices/id/generic-{state_key}.mp3'
        tasks.append(generate(state_word, VOICE_ID, path))

    # English — generic (single-station mode)
    for state_key, state_word in GENERIC_STATES_EN.items():
        if only and state_key != only:
            continue
        path = f'voices/en/generic-{state_key}.mp3'
        tasks.append(generate(state_word, VOICE_EN, path))

    print(f'Generating {len(tasks)} audio files...\n')
    # Run in batches of 8 to avoid overwhelming the API
    for i in range(0, len(tasks), 8):
        await asyncio.gather(*tasks[i:i+8])

    print(f'\nDone! {len(tasks)} files written to voices/id/ and voices/en/')

if __name__ == '__main__':
    asyncio.run(main())
