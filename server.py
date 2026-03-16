#!/usr/bin/env python3
"""
HAND CANNON - Gesture Shooting Game
─────────────────────────────────────
Run:  python3 server.py
Open: http://localhost:8080

Requirements: Python 3 (stdlib only, no pip install needed)
"""
import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # quiet mode

    def end_headers(self):
        # Allow SharedArrayBuffer / camera access
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

print("\n  ██╗  ██╗ █████╗ ███╗   ██╗██████╗      ")
print("  ██║  ██║██╔══██╗████╗  ██║██╔══██╗     ")
print("  ███████║███████║██╔██╗ ██║██║  ██║     ")
print("  ██╔══██║██╔══██║██║╚██╗██║██║  ██║     ")
print("  ██║  ██║██║  ██║██║ ╚████║██████╔╝     ")
print("  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝      ")
print("  ██████╗ █████╗ ███╗  ██╗███╗  ██╗ ██████╗ ███╗  ██╗")
print("  ██╔══╝ ██╔══██╗████╗ ██║████╗ ██║██╔═══██╗████╗ ██║")
print("  ██║    ███████║██╔██╗██║██╔██╗██║██║   ██║██╔██╗██║")
print("  ██║    ██╔══██║██║╚████║██║╚████║██║   ██║██║╚████║")
print("  ██████╗██║  ██║██║ ╚███║██║ ╚███║╚██████╔╝██║ ╚███║")
print("  ╚═════╝╚═╝  ╚═╝╚═╝  ╚══╝╚═╝  ╚══╝ ╚═════╝ ╚═╝  ╚══╝")
print()
print(f"  → http://localhost:{PORT}")
print("  → Ctrl+C to stop\n")

try:
    webbrowser.open(f"http://localhost:{PORT}")
except Exception:
    pass

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        sys.exit(0)
