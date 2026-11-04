import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="4 de novembro de 2026">
      <p>Esta política explica como o Vendlia trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

      <h2>1. Dados de quem usa a plataforma</h2>
      <ul>
        <li><b>O que coletamos:</b> nome, e-mail, senha (guardada de forma criptografada), nome da empresa, dados de cobrança (nome, CPF ou CNPJ, e-mail e celular) e registros de uso.</li>
        <li><b>Para quê:</b> criar e manter a conta, cobrar a assinatura, dar suporte, prevenir fraudes e melhorar o produto.</li>
        <li><b>Base legal:</b> execução do contrato, cumprimento de obrigação legal e legítimo interesse.</li>
      </ul>

      <h2>2. Dados das empresas prospectadas</h2>
      <ul>
        <li>Tratamos dados comerciais divulgados publicamente pelas próprias empresas (nome, endereço, telefone comercial, site, Instagram, horário, nota e fotos públicas), obtidos do Google Maps, do OpenStreetMap ou de listas importadas pelo usuário.</li>
        <li>Base legal: legítimo interesse do usuário em oferecer serviços a empresas, com respeito às expectativas do titular. Toda mensagem traz a opção de sair, e quem pede para não ser contatado entra numa lista de bloqueio permanente.</li>
        <li>Dados obtidos do Google ficam guardados por no máximo 30 dias, exceto o identificador do local, conforme as regras do Google.</li>
      </ul>

      <h2>3. Com quem compartilhamos</h2>
      <ul>
        <li>Provedores necessários para a plataforma funcionar: hospedagem (Railway), cobrança (Asaas), mapas e dados de locais (Google, OpenStreetMap), inteligência artificial (OpenRouter e os modelos que ele usa) e a integração com o WhatsApp.</li>
        <li>Não vendemos dados pessoais.</li>
        <li>Alguns desses provedores ficam fora do Brasil; nesses casos, exigimos garantias adequadas de proteção.</li>
      </ul>

      <h2>4. Por quanto tempo guardamos</h2>
      <p>Enquanto a conta estiver ativa e, depois do encerramento, pelo prazo exigido por lei (por exemplo, registros de acesso por 6 meses e dados fiscais por 5 anos). A lista de bloqueio de quem pediu para não ser contatado é mantida para garantir esse pedido.</p>

      <h2>5. Seus direitos</h2>
      <p>Você pode pedir confirmação, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, além de informações sobre compartilhamento. Empresas prospectadas também podem pedir para não serem contatadas ou para terem seus dados apagados. Faça o pedido {contactLine()}; respondemos em até 15 dias.</p>

      <h2>6. Segurança</h2>
      <p>Usamos conexão criptografada (HTTPS), senhas com hash, separação de dados por conta e acesso restrito aos sistemas. Em caso de incidente relevante, avisaremos os afetados e a ANPD.</p>

      <h2>7. Cookies</h2>
      <p>Usamos apenas o cookie necessário para manter você conectado. Não usamos cookies de publicidade.</p>
    </LegalPage>
  );
}
