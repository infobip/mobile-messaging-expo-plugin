#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_NAME = 'MobileMessagingExpo';
const CURRENT_YEAR = new Date().getFullYear();

const exts = [
  '.js', '.jsx', '.ts', '.tsx',
  '.java', '.kt',
  '.m', '.mm', '.swift', '.h'
];

const sourceDirs = [
  'plugin/src',
  'ios',
  'example'
];

const ignoredDirs = [
  'node_modules',
  'build',
  '.idea',
  '.gradle',
  'xcuserdata',
  'DerivedData',
  'project.xcworkspace',
  'buck-out',
  '.buckd',
  'Pods',
  'vendor',
  'fastlane',
  'coverage',
  '.yarn',
  '.cxx',
  '.kotlin',
];

const ignoredFiles = [
  '.DS_Store',
  'npm-debug.log',
  'yarn-error.log',
  'local.properties',
  'Podfile.lock',
  'package-lock.json',
  '.metro-health-check',
  'debug.keystore',
  'google-services.json',
];

function shouldIgnoreDir(dirName) {
  return ignoredDirs.includes(dirName);
}

function shouldIgnoreFile(fileName) {
  return ignoredFiles.includes(fileName);
}

function makeHeader(fileName) {
  return `//
//  ${fileName}
//  ${PROJECT_NAME}
//
//  Copyright (c) 2016-${CURRENT_YEAR} Infobip Limited
//  Licensed under the Apache License, Version 2.0
//
`;
}

function hasLicensedUnder(content) {
  return content.toLowerCase().includes('licensed under');
}

function replaceOrAddHeader(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (hasLicensedUnder(content)) {
      return;
    }

    const fileName = path.basename(filePath);
    const header = makeHeader(fileName);

    const lines = content.split('\n');
    let headerEndIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('//')) {
        headerEndIdx = i + 1;
      } else if (lines[i].trim() === '') {
        continue;
      } else {
        break;
      }
    }

    let newContent;
    if (headerEndIdx > 0) {
      newContent = header + lines.slice(headerEndIdx).join('\n');
      console.log(`Header replaced: ${filePath}`);
    } else {
      newContent = header + '\n' + content;
      console.log(`Header added: ${filePath}`);
    }

    fs.writeFileSync(filePath, newContent, 'utf8');
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err.message}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return;
  }
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        if (shouldIgnoreDir(file)) {
          return;
        }
        walk(fullPath);
      } else if (exts.includes(path.extname(fullPath))) {
        if (shouldIgnoreFile(file)) {
          return;
        }
        replaceOrAddHeader(fullPath);
      }
    } catch (err) {
      console.error(`Error accessing ${fullPath}: ${err.message}`);
    }
  });
}

sourceDirs.forEach(dir => walk(dir));

console.log('✅ Copyright header addition/replacement complete.');