"""Dry-run by default; --apply restores only this task's checksum-matched changes."""
from pathlib import Path
import hashlib
import json
import shutil
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[3]
BACKUP = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().lower()


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise SystemExit('Usage: python rollback_plan.py [--apply]')
    changes = json.loads((BACKUP/'change-manifest.json').read_text(encoding='utf-8'))
    after = json.loads((BACKUP/'after-manifest.json').read_text(encoding='utf-8'))
    before = json.loads((BACKUP/'before-manifest.json').read_text(encoding='utf-8-sig'))
    old_hash = {item['path'].replace('\\','/'): item['sha256'].lower() for item in before}
    for name in changes['modified'] + changes['added']:
        path = (ROOT/name).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise RuntimeError(f'Unsafe or missing target; no changes made: {name}')
        if digest(path) != after[name]['sha256'].lower():
            raise RuntimeError(f'File changed after optimization; no changes made: {name}')
        if name in changes['modified']:
            saved = BACKUP/'original'/name
            if digest(saved) != old_hash[name]:
                raise RuntimeError(f'Backup damaged; no changes made: {name}')
        elif name in old_hash:
            raise RuntimeError(f'Added target existed before task; no changes made: {name}')
    apply = sys.argv[1:] == ['--apply']
    if apply:
        for name in changes['modified']:
            shutil.copyfile(BACKUP/'original'/name, ROOT/name)
        for name in changes['added']:
            (ROOT/name).unlink()
    print(json.dumps({'mode': 'applied' if apply else 'dry-run',
                      'restore_files': len(changes['modified']),
                      'remove_task_created_files': len(changes['added']),
                      'later_edits_overwritten': False,
                      'note': 'No files changed.' if not apply else 'Task changes restored.'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
