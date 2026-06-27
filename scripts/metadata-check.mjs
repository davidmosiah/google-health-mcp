import { existsSync, readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const serverJson = JSON.parse(readFileSync('server.json', 'utf8'));
const errors = [];

function requireFile(path) {
  if (!existsSync(path)) errors.push(`Missing required file: ${path}`);
}

requireFile('README.md');
if (packageJson.private !== true && packageJson.license !== 'UNLICENSED') {
  requireFile('LICENSE');
}
requireFile('llms.txt');
requireFile('server.json');
requireFile('glama.json');
requireFile('docs/setup-feedback.md');
requireFile('docs/data-coverage.md');

if (serverJson.version !== packageJson.version) {
  errors.push(`server.json version ${serverJson.version} does not match package.json version ${packageJson.version}`);
}

const expectsRegistryPackage = packageJson.private !== true && serverJson.publication?.npm !== false;
const npmPackage = serverJson.packages?.find((pkg) => pkg.registryType === 'npm');
if (expectsRegistryPackage && !npmPackage) {
  errors.push('server.json must declare an npm package.');
}
if (npmPackage) {
  if (npmPackage.identifier !== packageJson.name) {
    errors.push(`server.json package identifier ${npmPackage.identifier} does not match package name ${packageJson.name}`);
  }
  if (npmPackage.version !== packageJson.version) {
    errors.push(`server.json package version ${npmPackage.version} does not match package version ${packageJson.version}`);
  }
}

if (Array.isArray(packageJson.files) && !packageJson.files.includes('llms.txt')) {
  errors.push('package.json files must include llms.txt.');
}

const readme = readFileSync('README.md', 'utf8');
if (!readme.includes('support --feedback --json')) {
  errors.push('README.md must document anonymous setup feedback.');
}
if (!readme.includes('coverage --live --json')) {
  errors.push('README.md must document live data coverage.');
}

const setupFeedbackDoc = readFileSync('docs/setup-feedback.md', 'utf8');
if (!setupFeedbackDoc.includes('support --feedback --json')) {
  errors.push('docs/setup-feedback.md must document the support --feedback command.');
}
const dataCoverageDoc = readFileSync('docs/data-coverage.md', 'utf8');
if (!dataCoverageDoc.includes('coverage --live --json')) {
  errors.push('docs/data-coverage.md must document live data coverage.');
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, metadata: true, package: packageJson.name, version: packageJson.version }, null, 2));
