#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run

import process from "node:process";
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { parse } from "jsr:@std/yaml";


// Define the structure of the configuration file
interface Config {
  appId: string;
  source: string;
  scripts: {
    setup: string[];
    start: string;
  };
  autoInitialize: boolean;
  autoActivateEnvBeforeEachStep: boolean;
  appRepository: string;
  appVersion: string;
  appDirectory: string;
  python?: {
    environment: 'venv' | 'conda' | 'none';
  };
  ports?: Array<{
    type: string
    envVar: number;
    port: number;
  }>;
  additionalOptions?: Array<{
    envVar: string;
    default: string;
    description: string;
  }>;
}

// Read and validate the configuration file
function readConfig(baseDir: string): Config {
  const configPath = path.join(baseDir, 'openlab.yaml');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    // const config = JSON.parse(configContent);
    const config = parse(configContent) as Config;


    // Validate essential properties
    const requiredProps = ['appId', 'source', 'scripts', 'appRepository', 'appVersion', 'appDirectory'];
    for (const prop of requiredProps) {
      if (!(prop in config)) {
        throw new Error(`Missing required property in config: ${prop}`);
      }
    }

    // Validate scripts object
    if (!config.scripts.setup || !Array.isArray(config.scripts.setup) || !config.scripts.start) {
      throw new Error('Invalid scripts configuration in config');
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON format in config file: ${configPath}. Error: ${error.message}`);
    }
    throw error;
  }
}

// Set environment variables based on the configuration
function setEnvVars(config: Config): NodeJS.ProcessEnv {
  const envVars: NodeJS.ProcessEnv = {
    APP_REPO: config.appRepository,
    APP_VERSION: config.appVersion,
    APP_DIRECTORY: config.appDirectory,
    ...process.env // Include existing environment variables
  };

  // Add port env vars
  if (config.ports) {
    for (const option of config.ports) {
      if (!(option.envVar in envVars)) {
        envVars[option.envVar] = option.port.toString();
      }
    }
  }

  // Add additional options if they exist
  if (config.additionalOptions) {
    for (const option of config.additionalOptions) {
      if (!(option.envVar in envVars)) {
        envVars[option.envVar] = option.default;
      }
    }
  }

  return envVars;
}

// Get the appropriate activation command based on the Python environment
function getActivationCommand(config: Config): string {
  if (config.python?.environment === 'venv') {
    return `source ${config.appDirectory}/venv/bin/activate && `;
  } else if (config.python?.environment === 'conda') {
    return `conda activate ${config.appId} && `;
  }
  return '';
}

// Execute a script with the given configuration and environment
function runScript(script: string, config: Config, env: NodeJS.ProcessEnv, baseDir: string): void {
  const activationCommand = config.autoActivateEnvBeforeEachStep ? getActivationCommand(config) : '';

  // Make the script executable if it's a shell script
  if (script.endsWith('.sh')) {
    const scriptPath = path.join(baseDir, script);
    console.log(`Making script executable: ${scriptPath}`);
    try {
      fs.chmodSync(scriptPath, '755');
    } catch (error) {
      console.error(`Failed to make script executable: ${error}`);
      throw error;
    }
  }

  const fullCommand = `${activationCommand}${script}`;
  console.log(`Running command: ${fullCommand}`);
  execSync(fullCommand, { stdio: 'inherit', shell: '/bin/bash', env, cwd: baseDir });
}

// Initialize the repository by cloning and checking out the specified version
function initializeRepo(config: Config): void {
  console.log(`Cloning repository: ${config.appRepository}`);
  execSync(`git clone ${config.appRepository} "${config.appDirectory}"`, { stdio: 'inherit' });

  console.log(`Checking out version: ${config.appVersion}`);
  execSync(`cd "${config.appDirectory}" && git checkout ${config.appVersion}`, { stdio: 'inherit' });
}

// Set up the Python environment based on the configuration
function setupPythonEnvironment(config: Config): void {
  if (config.python?.environment === 'venv') {
    console.log('Setting up venv environment');
    execSync(`python3 -m venv --system-site-packages "${config.appDirectory}/venv"`, { stdio: 'inherit' });
  } else if (config.python?.environment === 'conda') {
    console.log('Setting up conda environment');
    execSync(`conda create -n ${config.appId} python=3.8 -y`, { stdio: 'inherit' });
  } else {
    console.log('No Python environment specified, skipping setup');
  }
}

// Main function to orchestrate the setup process
async function main() {
  try {
    // Get the command and base directory from command line arguments
    const command = process.argv[2];
    const baseDir = process.argv[3];

    if (!command || !['install', 'start'].includes(command)) {
      throw new Error('Please provide a valid command: "install" or "start"');
    }

    if (!baseDir) {
      throw new Error('Please provide a directory as a command line argument.');
    }

    if (!fs.existsSync(baseDir)) {
      throw new Error(`Specified directory does not exist: ${baseDir}`);
    }

    // Read the configuration and set environment variables
    const config = readConfig(baseDir);
    const env = setEnvVars(config);

    if (command === 'install') {
      // Initialize repository and setup Python environment if auto-initialize is enabled
      if (config.autoInitialize) {
        initializeRepo(config);
        setupPythonEnvironment(config);
      }

      // Run all setup scripts defined in the configuration
      for (const setupScript of config.scripts.setup) {
        runScript(setupScript, config, env, baseDir);
      }

      console.log('Setup completed successfully');
    } else if (command === 'start') {
      console.log('Starting run script...');
      await runScript(config.scripts.start, config, env, baseDir);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('An unknown error occurred:', error);
    }
    process.exit(1);
  }
}

// Execute the main function and handle any uncaught errors
main().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});
