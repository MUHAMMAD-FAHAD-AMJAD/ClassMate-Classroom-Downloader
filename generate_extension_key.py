#!/usr/bin/env python3
"""
Chrome Extension Key Generator & Verifier
==========================================
This script helps generate/verify extension IDs from .pem files.

Usage:
    python generate_extension_key.py <path_to_pem_file>
    
Example:
    python generate_extension_key.py gcr-downloader.pem

Author: ClassMate Extension Team
"""

import sys
import hashlib
import base64
import re

def extract_der_from_pem(pem_content):
    """Extract the DER-encoded key from PEM format."""
    # Remove headers, footers, and whitespace
    pem_content = pem_content.strip()
    
    # Find the base64 content between headers
    match = re.search(
        r'-----BEGIN (?:RSA )?PRIVATE KEY-----\s*(.*?)\s*-----END (?:RSA )?PRIVATE KEY-----',
        pem_content,
        re.DOTALL
    )
    
    if not match:
        raise ValueError("Invalid PEM file format")
    
    base64_content = match.group(1).replace('\n', '').replace('\r', '').replace(' ', '')
    return base64.b64decode(base64_content)

def generate_extension_id(public_key_bytes):
    """
    Generate Chrome extension ID from public key bytes.
    
    Chrome uses the first 128 bits of the SHA256 hash of the public key,
    encoded using a-p (instead of 0-9a-f for hex).
    """
    # SHA256 hash of the public key
    sha256_hash = hashlib.sha256(public_key_bytes).digest()
    
    # Take first 16 bytes (128 bits)
    first_16_bytes = sha256_hash[:16]
    
    # Convert to extension ID format (a-p instead of 0-f)
    extension_id = ''
    for byte in first_16_bytes:
        extension_id += chr(ord('a') + (byte >> 4))
        extension_id += chr(ord('a') + (byte & 0x0F))
    
    return extension_id

def public_key_from_pem_to_base64(pem_path):
    """
    Extract public key from PEM and return base64 for manifest.json.
    
    NOTE: This is complex because you need the PUBLIC key portion.
    Chrome can do this automatically when you pack the extension.
    """
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend
        
        with open(pem_path, 'rb') as f:
            private_key = serialization.load_pem_private_key(
                f.read(),
                password=None,
                backend=default_backend()
            )
        
        # Get public key in DER format (SubjectPublicKeyInfo)
        public_key_der = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        # Base64 encode for manifest.json
        public_key_base64 = base64.b64encode(public_key_der).decode('ascii')
        
        return public_key_base64, public_key_der
        
    except ImportError:
        print("WARNING: 'cryptography' module not installed.")
        print("Install with: pip install cryptography")
        return None, None

def verify_extension_id(public_key_base64, expected_id):
    """Verify that a public key generates the expected extension ID."""
    public_key_der = base64.b64decode(public_key_base64)
    generated_id = generate_extension_id(public_key_der)
    
    print(f"\nPublic Key (base64):")
    print(public_key_base64)
    print(f"\nGenerated Extension ID: {generated_id}")
    print(f"Expected Extension ID:  {expected_id}")
    print(f"Match: {'✅ YES!' if generated_id == expected_id else '❌ NO'}")
    
    return generated_id == expected_id

def main():
    print("=" * 60)
    print("Chrome Extension Key Generator & Verifier")
    print("=" * 60)
    
    # Your current working extension ID
    target_id = "imbjccfljbpflflcnboplmplopgehbbe"
    
    # The public key from EXTENSION_KEYS.txt (let's verify it)
    existing_key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7UM+3EvNmeofsB5PjYQNUho1juv6Od5GlSTxwE3HsR//vkYaijGSm8Eoq2PhcAk9u7Q9GOxO1Rma6g52kKMniMoyrRn2en6SINh4MT3Nsj2nfe0VKDDZGVzK57co7kNrxkxtSeScDKs5/0B/CE/m3u9WXXw0XWAOI/sl9aMFWDEUFgC2kZT0zE3yJCvQEQmN09/hG8AD9V5dazzO/gVXN6Y3gog5W3QSipelO/Ky7f3ASaSuB2x8UojUyZxe7x4Dd1ZF9g6G6artvpMVyQeCdmLuaeebW9kxFgKyNApzhXi+8dUe3IvjGDbjQFIvkpnQzfibRLyU6S+x/bHWGt0RKwIDAQAB"
    
    print("\n" + "=" * 60)
    print("Verifying key from EXTENSION_KEYS.txt:")
    print("=" * 60)
    verify_extension_id(existing_key, target_id)
    
    if len(sys.argv) > 1:
        pem_path = sys.argv[1]
        print("\n" + "=" * 60)
        print(f"Processing PEM file: {pem_path}")
        print("=" * 60)
        
        public_key_base64, public_key_der = public_key_from_pem_to_base64(pem_path)
        
        if public_key_base64:
            generated_id = generate_extension_id(public_key_der)
            
            print(f"\nPublic Key (for manifest.json 'key' field):")
            print(public_key_base64)
            print(f"\nThis key generates Extension ID: {generated_id}")
            
            if generated_id == target_id:
                print("\n✅ SUCCESS! This key matches your OAuth-configured extension ID!")
                print("\nAdd this to your manifest.json:")
                print(f'"key": "{public_key_base64}",')
            else:
                print(f"\n⚠️  WARNING: This key generates a DIFFERENT extension ID!")
                print(f"   Generated: {generated_id}")
                print(f"   Expected:  {target_id}")
    else:
        print("\n" + "=" * 60)
        print("NEXT STEPS")
        print("=" * 60)
        print("""
To get the correct key for your extension ID (imbjccfljbpflflcnboplmplopgehbbe):

METHOD 1: Pack Extension in Chrome (Easiest)
---------------------------------------------
1. Open chrome://extensions
2. Enable Developer Mode  
3. Click "Pack extension"
4. Select your extension folder (gcr-downloader)
5. Leave the "Private key file" field EMPTY (first time)
6. Click "Pack Extension"
7. Chrome creates:
   - gcr-downloader.crx (the packed extension)  
   - gcr-downloader.pem (SAVE THIS - your private key)
8. Run this script with the .pem file:
   python generate_extension_key.py gcr-downloader.pem

METHOD 2: Get from Chrome Extension (if already loaded)
-------------------------------------------------------
The extension's public key is visible if you:
1. Go to chrome://extensions
2. Enable Developer Mode
3. Click "Details" on your extension
4. The ID shown there is generated from the key
   
To get the actual key bytes, you'd need the original .pem file.

IMPORTANT: Your OAuth is configured for imbjccfljbpflflcnboplmplopgehbbe
Make sure the key you use generates THIS exact ID!
""")

if __name__ == "__main__":
    main()
