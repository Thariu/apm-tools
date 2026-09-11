import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebasePublicConfig, isFirebaseConfigured } from "./config";

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. See docs/SETUP.md");
  }
  if (!app) {
    const config = getFirebasePublicConfig()!;
    app = getApps().length > 0 ? getApp() : initializeApp(config);
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}
