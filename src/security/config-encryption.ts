/**
 * Configuration Encryption System - BERS Security Module
 * 
 * Encrypts sensitive configuration data at rest using AES-256-GCM
 * with key derivation and secure storage practices.
 * 
 * @version 1.0.0
 * @author BERS Security Team
 */

import type { 
  Environment,
  ValidTenantHash,
  SecurityError 
} from '../types/security';

/* ===== ENCRYPTION INTERFACES ===== */

export interface EncryptionOptions {
  readonly algorithm: 'AES-256-GCM';
  readonly keyDerivation: 'PBKDF2' | 'scrypt';
  readonly iterations: number;
  readonly saltLength: number;
  readonly ivLength: number;
  readonly tagLength: number;
}

export interface EncryptedData {
  readonly algorithm: string;
  readonly data: string; // Base64 encoded
  readonly iv: string;   // Base64 encoded
  readonly tag: string;  // Base64 encoded
  readonly salt: string; // Base64 encoded
  readonly iterations: number;
  readonly timestamp: number;
  readonly version: string;
}

export interface DecryptionResult<T = any> {
  readonly data: T;
  readonly metadata: {
    readonly algorithm: string;
    readonly timestamp: number;
    readonly version: string;
  };
}

export interface KeyMaterial {
  readonly keyId: string;
  readonly algorithm: string;
  readonly purpose: 'encryption' | 'signing' | 'derivation';
  readonly environment: Environment;
  readonly createdAt: number;
  readonly expiresAt?: number;
  readonly isActive: boolean;
}

export interface EncryptionContext {
  readonly environment: Environment;
  readonly tenantHash?: ValidTenantHash;
  readonly configType: string;
  readonly additionalData?: Record<string, string>;
}

/* ===== ENCRYPTION MANAGER ===== */

export class ConfigurationEncryption {
  private readonly options: EncryptionOptions;
  private readonly keyCache: Map<string, CryptoKey>;
  private readonly keyMaterials: Map<string, KeyMaterial>;

  constructor(options: Partial<EncryptionOptions> = {}) {
    this.options = {
      algorithm: 'AES-256-GCM',
      keyDerivation: 'PBKDF2',
      iterations: 100000,
      saltLength: 32,
      ivLength: 12,
      tagLength: 16,
      ...options
    };

    this.keyCache = new Map();
    this.keyMaterials = new Map();
  }

  /**
   * Encrypt configuration data
   */
  async encryptConfiguration<T = any>(
    data: T,
    masterKey: string,
    context: EncryptionContext
  ): Promise<EncryptedData> {
    try {
      // Serialize data
      const plaintext = JSON.stringify(data);
      const plaintextBuffer = new TextEncoder().encode(plaintext);

      // Generate salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(this.options.saltLength));
      const iv = crypto.getRandomValues(new Uint8Array(this.options.ivLength));

      // Derive encryption key
      const key = await this.deriveKey(masterKey, salt);

      // Prepare additional authenticated data (AAD)
      const aad = this.createAAD(context);

      // Encrypt data
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: this.options.algorithm,
          iv: iv,
          additionalData: aad
        },
        key,
        plaintextBuffer
      );

      // Extract encrypted data and auth tag
      const encryptedData = new Uint8Array(encryptedBuffer.slice(0, -this.options.tagLength));
      const tag = new Uint8Array(encryptedBuffer.slice(-this.options.tagLength));

      return {
        algorithm: this.options.algorithm,
        data: this.arrayBufferToBase64(encryptedData),
        iv: this.arrayBufferToBase64(iv),
        tag: this.arrayBufferToBase64(tag),
        salt: this.arrayBufferToBase64(salt),
        iterations: this.options.iterations,
        timestamp: Date.now(),
        version: '1.0.0'
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt configuration data
   */
  async decryptConfiguration<T = any>(
    encryptedData: EncryptedData,
    masterKey: string,
    context: EncryptionContext
  ): Promise<DecryptionResult<T>> {
    try {
      // Validate algorithm
      if (encryptedData.algorithm !== this.options.algorithm) {
        throw new Error(`Unsupported algorithm: ${encryptedData.algorithm}`);
      }

      // Convert base64 to buffers
      const data = this.base64ToArrayBuffer(encryptedData.data);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const tag = this.base64ToArrayBuffer(encryptedData.tag);
      const salt = this.base64ToArrayBuffer(encryptedData.salt);

      // Derive decryption key
      const key = await this.deriveKey(masterKey, salt, encryptedData.iterations);

      // Prepare additional authenticated data (AAD)
      const aad = this.createAAD(context);

      // Combine encrypted data and tag
      const combinedBuffer = new Uint8Array(data.byteLength + tag.byteLength);
      combinedBuffer.set(new Uint8Array(data), 0);
      combinedBuffer.set(new Uint8Array(tag), data.byteLength);

      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: this.options.algorithm,
          iv: iv,
          additionalData: aad
        },
        key,
        combinedBuffer
      );

      // Convert to string and parse JSON
      const plaintext = new TextDecoder().decode(decryptedBuffer);
      const parsedData = JSON.parse(plaintext);

      return {
        data: parsedData as T,
        metadata: {
          algorithm: encryptedData.algorithm,
          timestamp: encryptedData.timestamp,
          version: encryptedData.version
        }
      };
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate master key for environment
   */
  async generateMasterKey(environment: Environment): Promise<string> {
    const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
    const masterKey = this.arrayBufferToBase64(keyMaterial);

    // Store key material metadata
    const keyId = await this.generateKeyId(environment);
    this.keyMaterials.set(keyId, {
      keyId,
      algorithm: this.options.algorithm,
      purpose: 'encryption',
      environment,
      createdAt: Date.now(),
      isActive: true
    });

    return masterKey;
  }

  /**
   * Rotate encryption key for environment
   */
  async rotateKey(environment: Environment, oldMasterKey: string): Promise<string> {
    // Generate new master key
    const newMasterKey = await this.generateMasterKey(environment);

    // Mark old key as inactive
    for (const [keyId, keyMaterial] of this.keyMaterials.entries()) {
      if (keyMaterial.environment === environment && keyMaterial.isActive) {
        this.keyMaterials.set(keyId, {
          ...keyMaterial,
          isActive: false,
          expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
        });
      }
    }

    console.log(`Key rotated for environment: ${environment}`);
    return newMasterKey;
  }

  /**
   * Derive encryption key from master key
   */
  private async deriveKey(
    masterKey: string, 
    salt: Uint8Array, 
    iterations?: number
  ): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(masterKey);
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: this.options.keyDerivation },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: this.options.keyDerivation,
        salt: salt,
        iterations: iterations || this.options.iterations,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: this.options.algorithm.split('-')[0],
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Create Additional Authenticated Data (AAD)
   */
  private createAAD(context: EncryptionContext): Uint8Array {
    const aadData = {
      environment: context.environment,
      tenantHash: context.tenantHash,
      configType: context.configType,
      timestamp: Math.floor(Date.now() / 1000), // Unix timestamp
      ...context.additionalData
    };

    const aadString = JSON.stringify(aadData);
    return new TextEncoder().encode(aadString);
  }

  /**
   * Generate unique key ID
   */
  private async generateKeyId(environment: Environment): Promise<string> {
    const timestamp = Date.now().toString();
    const random = crypto.getRandomValues(new Uint8Array(8));
    const data = `${environment}-${timestamp}-${this.arrayBufferToBase64(random)}`;
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return this.arrayBufferToBase64(hashBuffer).substring(0, 16);
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Validate encrypted data integrity
   */
  async validateIntegrity(encryptedData: EncryptedData): Promise<boolean> {
    try {
      // Check required fields
      const requiredFields = ['algorithm', 'data', 'iv', 'tag', 'salt', 'iterations', 'timestamp', 'version'];
      for (const field of requiredFields) {
        if (!(field in encryptedData)) {
          return false;
        }
      }

      // Validate base64 encoding
      try {
        this.base64ToArrayBuffer(encryptedData.data);
        this.base64ToArrayBuffer(encryptedData.iv);
        this.base64ToArrayBuffer(encryptedData.tag);
        this.base64ToArrayBuffer(encryptedData.salt);
      } catch {
        return false;
      }

      // Validate algorithm
      if (encryptedData.algorithm !== this.options.algorithm) {
        return false;
      }

      // Validate lengths
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const tag = this.base64ToArrayBuffer(encryptedData.tag);
      const salt = this.base64ToArrayBuffer(encryptedData.salt);

      if (iv.byteLength !== this.options.ivLength ||
          tag.byteLength !== this.options.tagLength ||
          salt.byteLength !== this.options.saltLength) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get key material information
   */
  getKeyMaterials(environment?: Environment): KeyMaterial[] {
    const materials = Array.from(this.keyMaterials.values());
    return environment ? materials.filter(m => m.environment === environment) : materials;
  }

  /**
   * Clean up expired keys
   */
  cleanupExpiredKeys(): void {
    const now = Date.now();
    for (const [keyId, keyMaterial] of this.keyMaterials.entries()) {
      if (keyMaterial.expiresAt && keyMaterial.expiresAt < now) {
        this.keyMaterials.delete(keyId);
        this.keyCache.delete(keyId);
        console.log(`Cleaned up expired key: ${keyId}`);
      }
    }
  }
}

/* ===== FACTORY AND EXPORTS ===== */

export const createConfigurationEncryption = (
  options?: Partial<EncryptionOptions>
): ConfigurationEncryption => {
  return new ConfigurationEncryption(options);
};

export const defaultConfigEncryption = createConfigurationEncryption();

export default ConfigurationEncryption;