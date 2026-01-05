#!/usr/bin/env node

/**
 * Config Migration Script: v1.2 → v1.3
 *
 * This script migrates tenant configurations from v1.2 to v1.3 by:
 * 1. Adding 'prompt' field to CTAs with action: "show_info"
 * 2. Adding 'program' field to all forms in conversational_forms
 * 3. Validating that all required fields are present
 *
 * Usage:
 *   node migrate-config-v1.2-to-v1.3.js <input-config.json> [output-config.json]
 *
 * If output file is not specified, will write to <input>-v1.3.json
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Migration statistics
const stats = {
    ctasUpdated: 0,
    ctasSkipped: 0,
    formsUpdated: 0,
    formsSkipped: 0,
    warnings: [],
    errors: []
};

/**
 * Generate a prompt from button text
 * Converts button text into a natural prompt for Bedrock
 */
function generatePromptFromButtonText(buttonText) {
    // Remove common CTA words
    let prompt = buttonText
        .replace(/^(Learn About|Learn More About|View|See|Show Me|Tell Me About|Get Info About)/i, '')
        .trim();

    // If we have a clean topic, wrap it in a natural prompt
    if (prompt) {
        return `Tell me about ${prompt}, including key details, requirements, and how to get involved or apply.`;
    }

    // Fallback for generic button text
    return `Provide information about ${buttonText.toLowerCase()}`;
}

/**
 * Migrate CTAs: Add prompt field to show_info actions
 */
function migrateCTAs(config) {
    if (!config.cta_definitions) {
        console.log(`${colors.yellow}⚠️  No cta_definitions found in config${colors.reset}`);
        return config;
    }

    console.log(`\n${colors.cyan}📝 Migrating CTAs...${colors.reset}`);

    Object.entries(config.cta_definitions).forEach(([ctaId, cta]) => {
        // Check if this is a show_info CTA
        if (cta.action === 'show_info') {
            // Check if prompt already exists
            if (cta.prompt) {
                console.log(`  ${colors.green}✓${colors.reset} ${ctaId}: Already has prompt`);
                stats.ctasSkipped++;
            } else {
                // Generate prompt from button text or query field
                let generatedPrompt;

                if (cta.query) {
                    // If there's a query field, use that as the prompt
                    generatedPrompt = cta.query;
                    console.log(`  ${colors.blue}↻${colors.reset} ${ctaId}: Using existing query as prompt`);
                } else {
                    // Generate from button text
                    const buttonText = cta.label || cta.text || ctaId;
                    generatedPrompt = generatePromptFromButtonText(buttonText);
                    console.log(`  ${colors.yellow}+${colors.reset} ${ctaId}: Generated prompt from button text`);
                    stats.warnings.push(`CTA '${ctaId}': Auto-generated prompt may need review`);
                }

                // Add the prompt field
                cta.prompt = generatedPrompt;
                stats.ctasUpdated++;

                console.log(`    Prompt: "${generatedPrompt.substring(0, 60)}..."`);
            }
        }
    });

    console.log(`\n  ${colors.green}✓${colors.reset} CTAs: ${stats.ctasUpdated} updated, ${stats.ctasSkipped} skipped`);

    return config;
}

/**
 * Migrate Forms: Add program field
 */
function migrateForms(config) {
    if (!config.conversational_forms) {
        console.log(`${colors.yellow}⚠️  No conversational_forms found in config${colors.reset}`);
        return config;
    }

    console.log(`\n${colors.cyan}📋 Migrating Forms...${colors.reset}`);

    Object.entries(config.conversational_forms).forEach(([formId, form]) => {
        // Check if program field exists
        if (form.program) {
            console.log(`  ${colors.green}✓${colors.reset} ${formId}: Already has program assigned (${form.program})`);
            stats.formsSkipped++;
        } else {
            // Try to infer program from form ID or create placeholder
            let inferredProgram = 'NEEDS_ASSIGNMENT';

            // Common patterns to try to infer program
            if (formId.includes('lovebox') || formId.includes('lb_')) {
                inferredProgram = 'lovebox';
            } else if (formId.includes('daretodream') || formId.includes('dd_')) {
                inferredProgram = 'daretodream';
            } else if (formId.includes('volunteer')) {
                inferredProgram = 'volunteer';
            } else if (formId.includes('contact') || formId.includes('general')) {
                inferredProgram = 'general';
            }

            form.program = inferredProgram;
            stats.formsUpdated++;

            if (inferredProgram === 'NEEDS_ASSIGNMENT') {
                console.log(`  ${colors.red}!${colors.reset} ${formId}: Set to 'NEEDS_ASSIGNMENT' - MANUAL REVIEW REQUIRED`);
                stats.errors.push(`Form '${formId}': Program set to 'NEEDS_ASSIGNMENT' - you MUST update this manually`);
            } else {
                console.log(`  ${colors.yellow}~${colors.reset} ${formId}: Inferred program '${inferredProgram}' (verify correctness)`);
                stats.warnings.push(`Form '${formId}': Program inferred as '${inferredProgram}' - please verify`);
            }
        }
    });

    console.log(`\n  ${colors.green}✓${colors.reset} Forms: ${stats.formsUpdated} updated, ${stats.formsSkipped} skipped`);

    return config;
}

/**
 * Update version metadata
 */
function updateVersion(config) {
    config.version = '1.3';
    config.generated_at = Math.floor(Date.now() / 1000);
    console.log(`\n${colors.green}✓ Updated version to 1.3${colors.reset}`);
    return config;
}

/**
 * Validate the migrated config
 */
function validateConfig(config) {
    console.log(`\n${colors.cyan}🔍 Validating migrated config...${colors.reset}`);

    let isValid = true;

    // Check CTAs
    if (config.cta_definitions) {
        Object.entries(config.cta_definitions).forEach(([ctaId, cta]) => {
            if (cta.action === 'show_info' && !cta.prompt) {
                console.log(`  ${colors.red}✗${colors.reset} CTA '${ctaId}': Missing required 'prompt' field`);
                stats.errors.push(`CTA '${ctaId}': Missing prompt field`);
                isValid = false;
            }
        });
    }

    // Check forms
    if (config.conversational_forms) {
        Object.entries(config.conversational_forms).forEach(([formId, form]) => {
            if (!form.program) {
                console.log(`  ${colors.red}✗${colors.reset} Form '${formId}': Missing required 'program' field`);
                stats.errors.push(`Form '${formId}': Missing program field`);
                isValid = false;
            } else if (form.program === 'NEEDS_ASSIGNMENT') {
                console.log(`  ${colors.red}✗${colors.reset} Form '${formId}': Program needs manual assignment`);
                isValid = false;
            }
        });
    }

    if (isValid) {
        console.log(`  ${colors.green}✓ All required fields present${colors.reset}`);
    }

    return isValid;
}

/**
 * Print migration summary
 */
function printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${colors.magenta}📊 Migration Summary${colors.reset}`);
    console.log(`${'='.repeat(60)}`);

    console.log(`\n${colors.cyan}CTAs:${colors.reset}`);
    console.log(`  Updated: ${stats.ctasUpdated}`);
    console.log(`  Skipped: ${stats.ctasSkipped}`);

    console.log(`\n${colors.cyan}Forms:${colors.reset}`);
    console.log(`  Updated: ${stats.formsUpdated}`);
    console.log(`  Skipped: ${stats.formsSkipped}`);

    if (stats.warnings.length > 0) {
        console.log(`\n${colors.yellow}⚠️  Warnings (${stats.warnings.length}):${colors.reset}`);
        stats.warnings.forEach(warning => {
            console.log(`  • ${warning}`);
        });
    }

    if (stats.errors.length > 0) {
        console.log(`\n${colors.red}❌ Errors (${stats.errors.length}):${colors.reset}`);
        stats.errors.forEach(error => {
            console.log(`  • ${error}`);
        });
    }

    console.log(`\n${'='.repeat(60)}\n`);
}

/**
 * Main migration function
 */
function migrateConfig(inputPath, outputPath) {
    console.log(`${colors.magenta}╔${'═'.repeat(58)}╗${colors.reset}`);
    console.log(`${colors.magenta}║  Config Migration: v1.2 → v1.3                          ║${colors.reset}`);
    console.log(`${colors.magenta}╚${'═'.repeat(58)}╝${colors.reset}\n`);

    // Read input config
    console.log(`${colors.cyan}📖 Reading config from: ${inputPath}${colors.reset}`);
    let config;
    try {
        const fileContent = fs.readFileSync(inputPath, 'utf8');
        config = JSON.parse(fileContent);
    } catch (error) {
        console.error(`${colors.red}❌ Error reading input file: ${error.message}${colors.reset}`);
        process.exit(1);
    }

    console.log(`${colors.green}✓ Config loaded (v${config.version || 'unknown'})${colors.reset}`);

    // Perform migrations
    config = migrateCTAs(config);
    config = migrateForms(config);
    config = updateVersion(config);

    // Validate
    const isValid = validateConfig(config);

    // Write output
    console.log(`\n${colors.cyan}💾 Writing migrated config to: ${outputPath}${colors.reset}`);
    try {
        fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`${colors.green}✓ Migration complete!${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}❌ Error writing output file: ${error.message}${colors.reset}`);
        process.exit(1);
    }

    // Print summary
    printSummary();

    // Exit with appropriate code
    if (!isValid) {
        console.log(`${colors.red}⚠️  Migration completed with ERRORS. Please review and fix manually.${colors.reset}\n`);
        process.exit(1);
    } else if (stats.warnings.length > 0) {
        console.log(`${colors.yellow}⚠️  Migration completed with warnings. Please review.${colors.reset}\n`);
    } else {
        console.log(`${colors.green}✅ Migration completed successfully!${colors.reset}\n`);
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
${colors.cyan}Config Migration Script: v1.2 → v1.3${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node migrate-config-v1.2-to-v1.3.js <input-config.json> [output-config.json]

${colors.yellow}Arguments:${colors.reset}
  input-config.json    Path to v1.2 config file to migrate
  output-config.json   Optional: Path for migrated v1.3 config
                       If not provided, uses <input>-v1.3.json

${colors.yellow}What this script does:${colors.reset}
  1. Adds 'prompt' field to CTAs with action: "show_info"
  2. Adds 'program' field to all forms (with inference)
  3. Updates version to 1.3
  4. Validates all required fields

${colors.yellow}Examples:${colors.reset}
  ${colors.green}# Migrate MYR384719 config${colors.reset}
  node migrate-config-v1.2-to-v1.3.js MYR384719-config.json

  ${colors.green}# Specify output file${colors.reset}
  node migrate-config-v1.2-to-v1.3.js old-config.json new-config.json

${colors.yellow}Post-Migration:${colors.reset}
  • Review all auto-generated prompts for accuracy
  • Verify inferred program assignments
  • Fix any forms with program 'NEEDS_ASSIGNMENT'
  • Test the migrated config in staging before deploying
        `);
        process.exit(0);
    }

    const inputPath = args[0];
    let outputPath = args[1];

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
        console.error(`${colors.red}❌ Input file not found: ${inputPath}${colors.reset}`);
        process.exit(1);
    }

    // Generate output path if not provided
    if (!outputPath) {
        const parsed = path.parse(inputPath);
        outputPath = path.join(parsed.dir, `${parsed.name}-v1.3${parsed.ext}`);
    }

    // Run migration
    migrateConfig(inputPath, outputPath);
}

module.exports = { migrateConfig, generatePromptFromButtonText };
