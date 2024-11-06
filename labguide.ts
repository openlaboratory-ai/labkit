// deno --allow-write=./README.md generateReadme.ts

type EnvVar = {
    envVar: string;
    default: string | number;
    description: string;
  };
  
  type Config = {
    appId: string;
    source: string;
    startupScript: string;
    setupScripts: string[];
    envVars: EnvVar[];
  };
  
  function generateReadme(config: Config): string {
    const { appId, source, envVars } = config;
  
    const envTableRows = envVars
      .map(
        (envVar) =>
          `| ${envVar.envVar} | ${envVar.description} | ${envVar.default} |`
      )
      .join("\n");
  
    return `# ${appId}
  Simple and portable installation configuration for ${source}.
  
  ## Important Notes
  
  - Must download a model in order to start.
  
  ## Deploy On Cloud
  
  Run this app within a cloud GPU labstation.
  
  https://openlaboratory.ai/apps/${appId}
  
  ## Run App Locally
  ### Docker Compose (Recommended)
  
  \`\`\`bash
  docker-compose up -d
  \`\`\`
  Must have docker and nvidia-container-toolkit installed.
  
  ### Docker Run
  \`\`\`bash
  docker run -d \\
    --name openlaboratory \\
    -p 8080:8080 \\
    -e app=openlaboratory/${appId} \\
    --gpus all \\
    openlaboratory/community
  \`\`\`
  
  ### Environment Variables
  
  Customize app installation and configuration by setting these env vars on the docker container.
  
  | Variable | Description | Default |
  | --- | --- | --- |
  ${envTableRows}
  `;
  }
  
  // Read and parse config from config.json
  const configText = await Deno.readTextFile("./config.json");
  const config: Config = JSON.parse(configText);
  
  // Generate README content
  const readmeContent = generateReadme(config);
  
  // Write to README.md file
  await Deno.writeTextFile("./README.md", readmeContent);
  
  console.log("README.md generated successfully!");