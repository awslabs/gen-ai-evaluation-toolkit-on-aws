plugins {
    java
    id("software.amazon.smithy.gradle.smithy-jar") version "0.10.0"
}

repositories {
    mavenCentral()
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

dependencies {
    implementation("software.amazon.smithy:smithy-model:1.62.0")
    implementation("software.amazon.smithy:smithy-aws-traits:1.62.0")
    implementation("software.amazon.smithy:smithy-aws-apigateway-openapi:1.62.0")
    implementation("software.amazon.smithy:smithy-openapi:1.62.0")
    implementation("software.amazon.smithy:smithy-validation-model:1.62.0")
    implementation("software.amazon.smithy:smithy-protocol-traits:1.62.0")
    implementation("software.amazon.smithy.typescript:smithy-typescript-codegen:0.50.0")
    implementation("software.amazon.smithy.typescript:smithy-aws-typescript-codegen:0.50.0")
}

smithy {
    format.set(true)
    outputDirectory = file("build/smithy")
}

tasks {
    val copyToPublic by registering(Copy::class) {
        dependsOn("build")
        from("build/smithy/source") {
            include("typescript-client-codegen/**")
            include("typescript-ssdk-codegen/**")
        }
        into("build/public")
    }
}

defaultTasks("build")
