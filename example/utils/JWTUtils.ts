//
//  JWTUtils.ts
//  InfobipExpoExample
//
//  Copyright (c) 2016-2025 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import 'react-native-get-random-values';
import {v4 as uuidv4} from 'uuid';
import CryptoJS from 'crypto-js';
import {SubjectType} from '../constants/SubjectType';

export interface JWTConfig {
  keyid: string;
  secretKeyHex: string;
  applicationCode: string;
  externalPersonId: string;
}

// Test configuration for JWT generation
export const testConfig: JWTConfig = {
  keyid: '',
  secretKeyHex: '',
  applicationCode: '',
  externalPersonId: '',
};

let currentUserJwt: string | null = null;

export function setCurrentUserJwt(token: string | null | undefined): void {
  currentUserJwt = token ?? null;
}

export function getCurrentUserJwt(): string | null {
  return currentUserJwt;
}

/**
 * Base64URL encode (JWT standard)
 */
function base64URLEncode(str: string): string {
  // First encode to base64, then convert to base64url
  const base64 = btoa(str);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a signed JWT token for MobileMessaging authentication
 */
function createJWTManually(
  keyid: string,
  secretKeyHex: string,
  applicationCode: string,
  externalPersonId: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: keyid,
  };

  const payload = {
    typ: 'Bearer',
    jti: uuidv4(),
    sub: externalPersonId,
    iss: applicationCode,
    iat: timestamp,
    exp: timestamp + 60,
    'infobip-api-key': applicationCode,
  };

  // Base64URL encode header and payload
  const encodedHeader = base64URLEncode(JSON.stringify(header));
  const encodedPayload = base64URLEncode(JSON.stringify(payload));

  // Create signature input
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Create HMAC-SHA256 signature using hex secret key
  const secretKey = CryptoJS.enc.Hex.parse(secretKeyHex);
  const signature = CryptoJS.HmacSHA256(signatureInput, secretKey);

  // Convert signature to Base64URL
  const signatureBase64 = signature.toString(CryptoJS.enc.Base64);
  const encodedSignature = signatureBase64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Combine all parts
  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  console.log('JWT:', jwt);

  return jwt;
}

export async function generateSignedJWT(
  keyid: string,
  secretKeyHex: string,
  applicationCode: string,
  externalPersonId: string,
): Promise<string> {
  return createJWTManually(keyid, secretKeyHex, applicationCode, externalPersonId);
}

export async function generateChatJWT(
  subjectType: SubjectType,
  subject: string,
  widgetId: string,
  secretKeyJson: string,
): Promise<string> {
  try {
    const uuid = uuidv4();
    const nowSeconds = Math.floor(Date.now() / 1000);

    const keyData = JSON.parse(secretKeyJson);
    const keyId = keyData.id;
    const keySecret = keyData.key;

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const payload = {
      jti: uuid,
      sub: subject,
      iss: widgetId,
      iat: nowSeconds,
      exp: nowSeconds + 60,
      ski: keyId,
      stp: subjectType,
      sid: uuid,
    };

    const encodedHeader = base64URLEncode(JSON.stringify(header));
    const encodedPayload = base64URLEncode(JSON.stringify(payload));

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const secretKey = CryptoJS.enc.Base64.parse(keySecret);
    const signature = CryptoJS.HmacSHA256(signingInput, secretKey);
    const signatureBase64 = signature.toString(CryptoJS.enc.Base64);
    const encodedSignature = signatureBase64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return `${signingInput}.${encodedSignature}`;
  } catch (error) {
    console.error('React app: Chat JWT generation failed: ', error);
    throw error;
  }
}
