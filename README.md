# VaultAI 🔐

A mobile password vault application built with React Native that combines military-grade encryption with artificial intelligence to deliver a smarter, safer credential management experience.

## About

VaultAI stores passwords locally on your device using AES-256 encryption. The app has a built in AI assistant powered by Google Gemini that can generate strong passwords, detect weak patterns, check for phishing URLs, and let you search your vault using natural language. There is also a security audit feature and an on-device machine learning system that learns your usage habits and locks the vault automatically if something looks suspicious.

## Features

- AES-256-CBC encryption with SHA-256 key derivation
- Master password + PIN dual authentication
- Biometric authentication (fingerprint / Face ID)
- AI chatbot powered by Google Gemini
- Context-aware password generation
- Natural language vault search
- AI powered security audit
- HaveIBeenPwned breach detection using k-anonymity
- On-device ML anomaly detection using Z-score statistical analysis
- Auto-lock after inactivity
- Failed PIN cooldown
- Rapid retrieval detection
- Zero-knowledge cloud sync via Firebase
- Password strength checker
- Password generator
- Developer panel with live Z-scores and behavioral baseline

## Tech Stack

- React Native + Expo
- JavaScript
- expo-sqlite (local database)
- expo-secure-store
- expo-crypto
- expo-local-authentication
- Firebase Auth + Firestore
- Google Gemini API
- HaveIBeenPwned API
- React Navigation

## Setup

1. Clone the repository
2. Run `npm install`
3. Copy `config.example.js` to `config.js` and fill in your API keys
4. Run `npx expo start`

## API Keys Required

- Google Gemini API key from https://aistudio.google.com
- Firebase project config from https://console.firebase.google.com

## Security Notes

- Passwords are encrypted on device before being stored or uploaded
- The AI assistant never receives raw passwords, only anonymous metadata
- Cloud sync uses zero-knowledge encryption
- Breach checks use k-anonymity so full passwords are never transmitted

## Screenshots

Coming soon

## Developed By

- Karim Al Khatib, Johann Correa, Omar Al Shaer, Yousef Shalaby 
- Abu Dhabi University - Cybersecurity Engineering Capstone Project
