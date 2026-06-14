import { describe, it, expect } from 'vitest';
import { classifyCommand } from '../tools';

describe('classifyCommand: hard blocks', () => {
  it('blocks rm -rf targeting home (~)', () => {
    expect(classifyCommand('rm -rf ~').blocked).toBe(true);
  });

  it('blocks rm -rf targeting $HOME', () => {
    expect(classifyCommand('rm -rf $HOME').blocked).toBe(true);
  });

  it('blocks rm -rf targeting ${HOME}', () => {
    expect(classifyCommand('rm -rf "${HOME}"').blocked).toBe(true);
  });

  it('blocks rm -rf targeting %USERPROFILE%', () => {
    expect(classifyCommand('rm -rf %USERPROFILE%').blocked).toBe(true);
  });

  it('blocks rm -rf /', () => {
    expect(classifyCommand('rm -rf /').blocked).toBe(true);
  });

  it('blocks rm -rf *', () => {
    expect(classifyCommand('rm -rf *').blocked).toBe(true);
  });

  it('blocks rm -rf .', () => {
    expect(classifyCommand('rm -rf .').blocked).toBe(true);
  });

  it('blocks rm -rf ..', () => {
    expect(classifyCommand('rm -rf ..').blocked).toBe(true);
  });

  it('blocks rm -fr (reversed flag order) targeting home', () => {
    expect(classifyCommand('rm -fr ~').blocked).toBe(true);
  });

  it('blocks rm -rf hidden in a compound command', () => {
    expect(classifyCommand('true; rm -rf ~').blocked).toBe(true);
  });

  it('blocks find . -delete', () => {
    expect(classifyCommand('find . -delete').blocked).toBe(true);
  });

  it('blocks find . -exec rm {} \\;', () => {
    expect(classifyCommand('find . -type f -exec rm {} \\;').blocked).toBe(true);
  });

  it('blocks Windows disk format', () => {
    expect(classifyCommand('format c:').blocked).toBe(true);
  });

  it('blocks mkfs', () => {
    expect(classifyCommand('mkfs.ext4 /dev/sda1').blocked).toBe(true);
  });

  it('blocks diskpart', () => {
    expect(classifyCommand('diskpart').blocked).toBe(true);
  });

  it('blocks kill as the leading command', () => {
    expect(classifyCommand('kill -9 1234').blocked).toBe(true);
  });

  it('blocks killall', () => {
    expect(classifyCommand('killall node').blocked).toBe(true);
  });

  it('blocks pkill', () => {
    expect(classifyCommand('pkill -f server').blocked).toBe(true);
  });

  it('blocks taskkill', () => {
    expect(classifyCommand('taskkill /IM node.exe /F').blocked).toBe(true);
  });

  it('blocks shutdown', () => {
    expect(classifyCommand('shutdown -h now').blocked).toBe(true);
  });

  it('blocks reboot', () => {
    expect(classifyCommand('reboot').blocked).toBe(true);
  });

  it('blocks poweroff', () => {
    expect(classifyCommand('poweroff').blocked).toBe(true);
  });

  it('blocks halt', () => {
    expect(classifyCommand('halt').blocked).toBe(true);
  });

  it('blocks dangerous commands prefixed with sudo', () => {
    expect(classifyCommand('sudo shutdown -h now').blocked).toBe(true);
    expect(classifyCommand('sudo kill -9 1234').blocked).toBe(true);
  });

  it('blocks rmdir /s targeting home', () => {
    expect(classifyCommand('rmdir /s /q ~').blocked).toBe(true);
  });

  it('blocks rm -rf /*', () => {
    expect(classifyCommand('rm -rf /*').blocked).toBe(true);
  });

  it('blocks rm -rf ~/*', () => {
    expect(classifyCommand('rm -rf ~/*').blocked).toBe(true);
  });
});

describe('classifyCommand: blocklist-bypass attempts', () => {
  it('blocks rm via absolute path /usr/bin/rm', () => {
    expect(classifyCommand('/usr/bin/rm -rf /').blocked).toBe(true);
  });

  it('blocks rm via backslash-escaped alias bypass', () => {
    expect(classifyCommand('\\rm -rf ~').blocked).toBe(true);
  });

  it('blocks rm wrapped in env', () => {
    expect(classifyCommand('env rm -rf /').blocked).toBe(true);
  });

  it('blocks rm wrapped in env with a VAR=value assignment', () => {
    expect(classifyCommand('env FOO=bar rm -rf /').blocked).toBe(true);
  });

  it('blocks rm wrapped in xargs', () => {
    expect(classifyCommand('xargs rm -rf /').blocked).toBe(true);
  });

  it('blocks rm via absolute path wrapped in sudo', () => {
    expect(classifyCommand('sudo /usr/bin/rm -rf /').blocked).toBe(true);
  });

  it('blocks taskkill via a Windows path with .exe extension', () => {
    expect(classifyCommand('C:\\Windows\\System32\\taskkill.exe /IM node.exe /F').blocked).toBe(true);
  });

  it('still allows a plain rm of a file via absolute path (destructive, not blocked)', () => {
    const r = classifyCommand('/usr/bin/rm notes.txt');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });
});

describe('classifyCommand: previously-broken false positives now pass', () => {
  it('allows git format-patch', () => {
    const r = classifyCommand('git format-patch HEAD~1');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(false);
  });

  it('allows npm run format', () => {
    const r = classifyCommand('npm run format');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(false);
  });

  it('allows running a script literally named kill-server.sh', () => {
    const r = classifyCommand('./kill-server.sh');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(false);
  });

  it('allows npm run kill-server', () => {
    const r = classifyCommand('npm run kill-server');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(false);
  });
});

describe('classifyCommand: destructive-but-allowed', () => {
  it('flags rm -rf on a subdirectory as destructive but not blocked', () => {
    const r = classifyCommand('rm -rf ~/work');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('flags plain rm of a file as destructive but not blocked', () => {
    const r = classifyCommand('rm notes.txt');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('flags git reset --hard as destructive but not blocked', () => {
    const r = classifyCommand('git reset --hard origin/main');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('flags git clean -fd as destructive but not blocked', () => {
    const r = classifyCommand('git clean -fd');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('flags DROP TABLE as destructive but not blocked', () => {
    const r = classifyCommand("psql -c 'DROP TABLE users;'");
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('flags TRUNCATE TABLE as destructive but not blocked', () => {
    const r = classifyCommand('TRUNCATE TABLE sessions');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('flags a single > redirect as destructive', () => {
    const r = classifyCommand('echo hi > config.json');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(true);
  });

  it('does not flag >> append as destructive', () => {
    const r = classifyCommand('echo hi >> log.txt');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(false);
  });

  it('does not flag 2>&1 stream redirection as destructive', () => {
    const r = classifyCommand('npm test 2>&1 | tee out.log');
    expect(r.blocked).toBe(false);
    expect(r.destructive).toBe(false);
  });
});

describe('classifyCommand: ordinary safe commands', () => {
  it('allows ls', () => {
    const r = classifyCommand('ls -la');
    expect(r).toEqual({ blocked: false, destructive: false });
  });

  it('allows npm install', () => {
    const r = classifyCommand('npm install');
    expect(r).toEqual({ blocked: false, destructive: false });
  });

  it('allows git status', () => {
    const r = classifyCommand('git status');
    expect(r).toEqual({ blocked: false, destructive: false });
  });

  it('allows vitest run', () => {
    const r = classifyCommand('npx vitest run');
    expect(r).toEqual({ blocked: false, destructive: false });
  });
});
