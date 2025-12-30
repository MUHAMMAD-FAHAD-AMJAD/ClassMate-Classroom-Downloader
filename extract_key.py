# extract_key.py - Chrome Extension Key Extractor
# Run with: python extract_key.py
# 
# This script extracts the public key from your .pem file
# and calculates the fixed Extension ID for OAuth configuration.

import hashlib
import base64
import os
import glob
import sys

def find_pem_file():
    """Auto-find .pem file in common locations."""
    locations = [
        "gcr-downloader.pem",
        os.path.join(os.path.dirname(__file__), "gcr-downloader.pem"),
        os.path.expandvars(r"%USERPROFILE%\Documents\GCR-Keys\gcr-downloader.pem"),
        os.path.expandvars(r"%USERPROFILE%\Documents\gcr-downloader.pem"),
        os.path.expandvars(r"%USERPROFILE%\Desktop\gcr-downloader.pem"),
    ]
    
    for loc in locations:
        if os.path.exists(loc):
            return os.path.abspath(loc)
    
    # Try to find any .pem file in current directory
    pem_files = glob.glob("*.pem")
    if pem_files:
        return os.path.abspath(pem_files[0])
    
    return None

def main():
    print("=" * 60)
    print("Chrome Extension Key Extractor")
    print("=" * 60)
    print()
    
    # Find .pem file
    pem_path = find_pem_file()
    
    if not pem_path:
        print("ERROR: No .pem file found!")
        print()
        print("To fix this:")
        print("1. Go to chrome://extensions/")
        print("2. Click 'Pack extension'")
        print("3. Select your extension folder")
        print("4. Leave 'Private key file' empty")
        print("5. Click 'Pack extension'")
        print("6. Copy the .pem file to this folder")
        print("7. Run this script again")
        sys.exit(1)
    
    print(f"Found .pem file: {pem_path}")
    print()
    
    # Import cryptography
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
    except ImportError:
        print("ERROR: cryptography library not installed!")
        print()
        print("To fix this, run:")
        print("    pip install cryptography")
        sys.exit(1)
    
    # Read private key
    try:
        with open(pem_path, 'rb') as f:
            private_key = serialization.load_pem_private_key(
                f.read(), 
                password=None, 
                backend=default_backend()
            )
    except Exception as e:
        print(f"ERROR: Failed to read .pem file: {e}")
        sys.exit(1)
    
    # Get public key in DER format
    public_key_der = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    # Calculate Extension ID (SHA256 -> first 16 bytes -> a-p alphabet)
    sha256 = hashlib.sha256(public_key_der).digest()[:16]
    extension_id = ''.join(
        chr(ord('a') + (b >> 4)) + chr(ord('a') + (b & 0xf)) 
        for b in sha256
    )
    
    # Base64 encode public key for manifest.json
    public_key_base64 = base64.b64encode(public_key_der).decode('ascii')
    
    # Display results
    print("=" * 60)
    print("SUCCESS! Copy these values:")
    print("=" * 60)
    print()
    print("EXTENSION ID (for Google Cloud Console):")
    print("-" * 40)
    print(extension_id)
    print()
    print("PUBLIC KEY (for manifest.json):")
    print("-" * 40)
    print(public_key_base64)
    print()
    print("=" * 60)
    
    # Save to file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "EXTENSION_KEYS.txt")
    
    with open(output_path, "w") as f:
        f.write("Chrome Extension Key Information\n")
        f.write("=" * 40 + "\n\n")
        f.write(f"Extension ID: {extension_id}\n\n")
        f.write(f"Public Key:\n{public_key_base64}\n\n")
        f.write(f"PEM File: {pem_path}\n\n")
        f.write("OAuth Updated in Google Cloud Console: NO\n")
        f.write("(Change to YES after updating)\n")
    
    print(f"Saved to: {output_path}")
    print()
    print("NEXT STEPS:")
    print("1. Add the PUBLIC KEY to manifest.json (\"key\" field)")
    print("2. Add the EXTENSION ID to Google Cloud Console OAuth settings")
    print("3. Wait 5 minutes for OAuth propagation")
    print("4. Test authentication")

if __name__ == "__main__":
    main()
