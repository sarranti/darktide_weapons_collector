import { useState, useEffect } from "react";

const CLIENT_ID =
  "775330457133-692sd4g01l9m9bstl9cu0ugio11vll28.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOC =
  "https://sheets.googleapis.com/$discovery/rest?version=v4";

export function useGoogleSheets() {
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState(null);

  useEffect(() => {
    const loadGapi = () => {
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => {
        window.gapi.load("client", () => {
          window.gapi.client
            .init({ discoveryDocs: [DISCOVERY_DOC] })
            .then(() => setIsGapiLoaded(true))
            .catch((err) => console.error("GAPI Init Error:", err));
        });
      };
      document.body.appendChild(script);
    };

    const loadGsi = () => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          prompt: "", // Empty string enables silent token refresh
          callback: (tokenResponse) => {
            if (tokenResponse.error) {
              setIsAuthenticated(false);
              return;
            }
            setIsAuthenticated(true);
            // Set expiry to 55 minutes from now (tokens last 60 mins)
            setTokenExpiry(Date.now() + 55 * 60 * 1000);
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

  // Add this inside useGoogleSheets()
  const silentRefresh = () => {
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        prompt: "", // Empty string for silent refresh
        callback: (response) => {
          if (response.error) {
            setIsAuthenticated(false);
            reject(response.error);
          } else {
            setIsAuthenticated(true);
            setTokenExpiry(Date.now() + 55 * 60 * 1000);
            resolve(response);
          }
        },
      });
      client.requestAccessToken();
    });
  };

  // Don't forget to export it:
  return { isGapiLoaded, isAuthenticated, login, tokenExpiry, silentRefresh };
}
