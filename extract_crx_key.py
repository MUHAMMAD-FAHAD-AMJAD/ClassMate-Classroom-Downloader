#!/usr/bin/env python3
"""
Extract Public Key from CRX File
================================
Chrome CRX files contain the public key that determines the extension ID.
This script extracts it.

CRX3 Format (Chrome 64+):
- Magic number: "Cr24" (4 bytes)
- Version: 3 (4 bytes, little-endian)
- Header size (4 bytes, little-endian)
- Header (protobuf)
- ZIP content

Author: ClassMate Extension Team
"""

import sys
import struct
import base64
import hashlib

def generate_extension_id(public_key_bytes):
    """Generate Chrome extension ID from public key bytes."""
    sha256_hash = hashlib.sha256(public_key_bytes).digest()
    first_16_bytes = sha256_hash[:16]
    extension_id = ''
    for byte in first_16_bytes:
        extension_id += chr(ord('a') + (byte >> 4))
        extension_id += chr(ord('a') + (byte & 0x0F))
    return extension_id

def extract_key_from_crx3(crx_path):
    """Extract public key from CRX3 format file."""
    with open(crx_path, 'rb') as f:
        # Read magic number
        magic = f.read(4)
        if magic != b'Cr24':
            print(f"Error: Not a valid CRX file (magic: {magic})")
            return None
        
        # Read version
        version = struct.unpack('<I', f.read(4))[0]
        print(f"CRX Version: {version}")
        
        if version == 3:
            # CRX3 format
            header_size = struct.unpack('<I', f.read(4))[0]
            print(f"Header size: {header_size}")
            
            header_data = f.read(header_size)
            
            # Parse protobuf manually (simplified)
            # The public key is typically the first key in the signed data
            # Looking for ASN.1 DER encoded public key (starts with 0x30)
            
            # Search for RSA public key pattern (SPKI format)
            # MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
            # In bytes: 30 82 01 22 30 0D 06 09...
            
            idx = 0
            while idx < len(header_data) - 4:
                # Look for ASN.1 SEQUENCE tag for RSA public key
                if header_data[idx:idx+4] == b'\x30\x82\x01\x22':
                    # Found potential public key
                    key_length = 294  # Standard RSA 2048 SPKI length
                    potential_key = header_data[idx:idx+key_length]
                    
                    # Verify it looks like a key
                    if len(potential_key) == key_length:
                        return potential_key
                idx += 1
            
            # Alternative: try to find the key in a different way
            # Sometimes the key is prefixed with length bytes in protobuf
            idx = 0
            while idx < len(header_data) - 300:
                # Look for SPKI format RSA key start sequence
                if header_data[idx:idx+2] == b'\x30\x82':
                    length = struct.unpack('>H', header_data[idx+2:idx+4])[0]
                    if 290 <= length <= 300:  # RSA 2048 key length range
                        potential_key = header_data[idx:idx+4+length]
                        
                        # Try to generate ID and check if it's valid
                        test_id = generate_extension_id(potential_key)
                        print(f"Found potential key at offset {idx}, ID: {test_id}")
                        
                        return potential_key
                idx += 1
                
            print("Could not find public key in CRX3 header")
            print(f"Header data (first 500 bytes hex): {header_data[:500].hex()}")
            return None
            
        elif version == 2:
            # CRX2 format (older)
            pubkey_len = struct.unpack('<I', f.read(4))[0]
            sig_len = struct.unpack('<I', f.read(4))[0]
            
            public_key = f.read(pubkey_len)
            print(f"Public key length: {pubkey_len}")
            
            return public_key
        else:
            print(f"Unknown CRX version: {version}")
            return None

def main():
    crx_path = sys.argv[1] if len(sys.argv) > 1 else "d:\\SLIDES DOWNLOADER\\gcr-downloader.crx"
    
    print("=" * 60)
    print("CRX Public Key Extractor")
    print("=" * 60)
    print(f"\nReading: {crx_path}")
    
    public_key = extract_key_from_crx3(crx_path)
    
    if public_key:
        key_base64 = base64.b64encode(public_key).decode('ascii')
        extension_id = generate_extension_id(public_key)
        
        print("\n" + "=" * 60)
        print("RESULTS")
        print("=" * 60)
        print(f"\nExtension ID: {extension_id}")
        print(f"\nPublic Key (for manifest.json):")
        print(key_base64)
        
        target_id = "imbjccfljbpflflcnboplmplopgehbbe"
        print(f"\n\nTarget ID: {target_id}")
        if extension_id == target_id:
            print("✅ This key MATCHES your OAuth configuration!")
            print("\nAdd this to your manifest.json:")
            print(f'"key": "{key_base64}",')
        else:
            print("❌ This key does NOT match your OAuth configuration")
    else:
        print("\nFailed to extract public key")

if __name__ == "__main__":
    main()
