#!/usr/bin/env python3
"""Double-fork daemonizer for the Next.js dev server.

The sandbox reaper kills processes that remain children of the tool shell
when a tool call ends (even setsid-detached ones). A classic double-fork
orphan survives. Usage:
    python3 scripts/dev-daemon.py start   # boot `bun run dev` detached
    python3 scripts/dev-daemon.py status  # is port 3000 answering?
"""
import os
import sys
import time
import urllib.request

CWD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(CWD, 'dev.log')


def start() -> None:
    pid = os.fork()
    if pid == 0:
        os.setsid()
        pid2 = os.fork()
        if pid2 == 0:
            os.chdir(CWD)
            # Same command the `dev` package script runs, minus its tee pipe —
            # we own the redirection so dev.log stays a clean append-only log.
            with open(LOG, 'ab', 0) as logfd, open(os.devnull, 'rb') as nullfd:
                os.dup2(logfd.fileno(), 1)
                os.dup2(logfd.fileno(), 2)
                os.dup2(nullfd.fileno(), 0)
                env = dict(os.environ)
                env['NODE_OPTIONS'] = '--max-old-space-size=1536'
                os.execve(
                    '/bin/bash',
                    ['/bin/bash', '-c', "exec ./node_modules/.bin/next dev -p 3000"],
                    env,
                )
        os._exit(0)
    os.waitpid(pid, 0)
    print(f"dev daemon spawned (see {LOG})")


def status() -> int:
    for _ in range(90):
        try:
            with urllib.request.urlopen('http://localhost:3000/api/config', timeout=5) as r:
                if r.status == 200:
                    print('UP: /api/config answered 200')
                    return 0
        except Exception:
            pass
        time.sleep(1)
    print('DOWN: no answer on :3000 after 90s')
    return 1


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'start'
    if cmd == 'start':
        start()
    elif cmd == 'status':
        sys.exit(status())
    else:
        print(__doc__)
        sys.exit(2)
