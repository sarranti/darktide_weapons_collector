import { useState, useEffect } from 'react';

// REPLACE THIS WITH YOUR GCP CLIENT ID
// 775330457133-692sd4g01l9m9bstl9cu0ugio11vll28.apps.googleusercontent.com
const CLIENT_ID = '775330457133-692sd4g01l9m9bstl9cu0ugio11vll28.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

export function useGoogleSheets() {
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const loadGapi = () => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client', () => {
          window.gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] })
            .then(() => setIsGapiLoaded(true))
            .catch(err => console.error("GAPI Init Error:", err));
        });
      };
      document.body.appendChild(script);
    };

    const loadGsi = () => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (tokenResponse) => {
            if (tokenResponse.error) {
              console.error('Auth Error:', tokenResponse);
              return;
            }
            setIsAuthenticated(true);
          },
        });
        setTokenClient(client);
      };
      document.body.appendChild(script);
    };

    loadGapi();
    loadGsi();
  }, []);

  const login = () => {
    if (tokenClient) tokenClient.requestAccessToken();
  };

  return { isGapiLoaded, isAuthenticated, login };
}