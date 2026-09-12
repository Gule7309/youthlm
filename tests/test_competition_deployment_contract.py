"""Static safety contract for the event-day AWS deployment."""

import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


class CompetitionDeploymentContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.template = (
            REPOSITORY_ROOT / "infra" / "competition-ec2.yaml"
        ).read_text(encoding="utf-8")
        cls.script = (
            REPOSITORY_ROOT / "scripts" / "deploy-competition.ps1"
        ).read_text(encoding="utf-8")

    def test_ingress_is_one_operator_ip_and_never_ssh(self) -> None:
        self.assertIn("CidrIp: !Ref ClientCidr", self.template)
        self.assertIn("ToPort: 8000", self.template)
        self.assertNotIn("ToPort: 22", self.template)
        self.assertNotIn("FromPort: 22", self.template)
        self.assertEqual(self.template.count("CidrIp: 0.0.0.0/0"), 1)
        self.assertIn("SecurityGroupEgress:", self.template)

    def test_instance_uses_roles_private_ecr_and_hardened_metadata(self) -> None:
        for required in (
            "AWS::ECR::Repository",
            "EncryptionType: AES256",
            "ScanOnPush: true",
            "AmazonSSMManagedInstanceCore",
            "HttpTokens: required",
            "Encrypted: true",
            "AssociatePublicIpAddress: true",
            "--restart unless-stopped",
        ):
            with self.subTest(required=required):
                self.assertIn(required, self.template)

        for forbidden in (
            "AWS_ACCESS_KEY_ID=",
            "AWS_SECRET_ACCESS_KEY=",
            "AWS_SESSION_TOKEN=",
            "KeyName:",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, self.template)

    def test_bedrock_policy_is_limited_to_the_selected_model(self) -> None:
        self.assertIn("us.amazon.nova-lite-v1:0", self.template)
        self.assertIn(
            "foundation-model/amazon.nova-lite-v1:0",
            self.template,
        )
        self.assertNotIn("foundation-model/*", self.template)

    def test_deploy_script_requires_session_credentials_and_readiness(self) -> None:
        for required in (
            '"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"',
            "cloudformation validate-template",
            "cloudformation deploy",
            "codebuild start-build",
            '"$applicationUrl/ready"',
        ):
            with self.subTest(required=required):
                self.assertIn(required, self.script)


if __name__ == "__main__":
    unittest.main()
