import fs from 'fs';
import path from 'path';

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
}

export class GoogleClient {
  private accessToken: string = '';
  private refreshToken: string = '';
  private expiryDate: number = 0;
  private clientId: string = '';
  private clientSecret: string = '';

  constructor(config: { clientId?: string; clientSecret?: string } = {}) {
    this.clientId = config.clientId || '';
    this.clientSecret = config.clientSecret || '';
  }

  public setTokens(tokens: GoogleTokens) {
    this.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      this.refreshToken = tokens.refreshToken;
    }
    if (tokens.expiryDate) {
      this.expiryDate = tokens.expiryDate;
    }
  }

  public getTokens(): GoogleTokens {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiryDate: this.expiryDate
    };
  }

  public hasAuth(): boolean {
    return !!this.accessToken;
  }

  public getAuthUrl(redirectUri: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets'
    ].join(' ');

    return `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(this.clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent`;
  }

  public async exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange authorization code: ${errorText}`);
    }

    const data = await response.json() as any;
    const tokens: GoogleTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiryDate: Date.now() + (data.expires_in * 1000)
    };

    this.setTokens(tokens);
    return tokens;
  }

  public async refreshTokensIfNeeded(): Promise<string> {
    if (!this.refreshToken) {
      return this.accessToken;
    }

    // Refresh if expired or expiring within 60 seconds
    if (Date.now() + 60000 >= this.expiryDate) {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      });

      if (response.ok) {
        const data = await response.json() as any;
        this.accessToken = data.access_token;
        this.expiryDate = Date.now() + (data.expires_in * 1000);
      }
    }

    return this.accessToken;
  }

  // Create workspace sync folder
  public async getOrCreateFolder(folderName: string): Promise<string> {
    const token = await this.refreshTokensIfNeeded();
    
    // Check if folder exists
    const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (searchResponse.ok) {
      const data = await searchResponse.json() as any;
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Create new folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create Google Drive Folder: ${errorText}`);
    }

    const folder = await createResponse.json() as any;
    return folder.id;
  }

  // List files in Google Drive folder
  public async listFiles(folderId: string): Promise<any[]> {
    const token = await this.refreshTokensIfNeeded();
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)`;

    const response = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as any;
    return data.files || [];
  }

  // Upload or update local file to Google Drive folder
  public async uploadOrUpdateFile(filePath: string, parentFolderId: string): Promise<void> {
    const token = await this.refreshTokensIfNeeded();
    const fileName = path.basename(filePath);
    
    // Get file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if file already exists in folder
    const query = encodeURIComponent(`name = '${fileName}' and '${parentFolderId}' in parents and trashed = false`);
    const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${query}`;
    const checkResponse = await fetch(checkUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    let existingFileId = '';
    if (checkResponse.ok) {
      const data = await checkResponse.json() as any;
      if (data.files && data.files.length > 0) {
        existingFileId = data.files[0].id;
      }
    }

    let mimeType = 'text/plain';
    let gdocMimeType = ''; // Google Doc conversion type

    if (fileName.endsWith('.json')) {
      mimeType = 'application/json';
    } else if (fileName.endsWith('.csv')) {
      mimeType = 'text/csv';
      gdocMimeType = 'application/vnd.google-apps.spreadsheet'; // convert to Google Sheets
    } else if (fileName.endsWith('.md') || fileName.endsWith('.docx')) {
      mimeType = 'text/markdown';
      gdocMimeType = 'application/vnd.google-apps.document'; // convert to Google Docs
    }

    const metadata = {
      name: fileName,
      parents: existingFileId ? undefined : [parentFolderId],
      mimeType: gdocMimeType || undefined
    };

    const boundary = 'foo_bar_boundary';
    const multipartBody = 
      `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n` +
      `\r\n--${boundary}--`;

    const uploadUrl = existingFileId 
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const method = existingFileId ? 'PATCH' : 'POST';

    const response = await fetch(uploadUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Failed uploading file ${fileName}: ${errText}`);
    }
  }

  // Import / download file from Google Drive
  public async downloadFile(fileId: string, mimeType: string): Promise<string> {
    const token = await this.refreshTokensIfNeeded();
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    // If Google Doc/Sheet format, we must export it
    if (mimeType.includes('vnd.google-apps.document')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/markdown`;
    } else if (mimeType.includes('vnd.google-apps.spreadsheet')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    }

    const response = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to download cloud file: ${errText}`);
    }

    return response.text();
  }
}
