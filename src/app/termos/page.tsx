import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="4 de novembro de 2026">
      <p>Estes termos regem o uso do Vendlia, plataforma que ajuda profissionais e agências a encontrar empresas sem site, criar sites de demonstração e fazer contato comercial pelo WhatsApp. Ao criar uma conta, você concorda com estes termos.</p>

      <h2>1. Conta e responsabilidade</h2>
      <ul>
        <li>Você precisa ter 18 anos ou mais e informar dados verdadeiros.</li>
        <li>Você é responsável pelo que faz com a plataforma, inclusive pelas mensagens enviadas pelo seu número e pelos sites que oferece e publica.</li>
        <li>Mantenha sua senha em sigilo. Cada conta pode ter outros usuários, sob a responsabilidade de quem a administra.</li>
      </ul>

      <h2>2. Teste grátis e planos</h2>
      <ul>
        <li>O teste grátis dura {TRIAL_DAYS} dias, não pede cartão e inclui {PLANS.trial.searches} buscas e {PLANS.trial.sites} site criado com IA. No teste, o envio automático pelo WhatsApp fica desligado.</li>
        <li>Os planos pagos têm limites mensais de buscas, sites com IA, logos e números de WhatsApp, descritos na página de planos. Limites não usados não acumulam.</li>
        <li>A cobrança é feita pelo Asaas, por PIX, boleto ou cartão, e renova automaticamente na periodicidade escolhida (mensal, trimestral ou anual) até você cancelar.</li>
        <li>Você pode cancelar a qualquer momento, sem multa, na página Plano. O acesso continua até o fim do período já pago.</li>
        <li>Garantia de 7 dias: se cancelar até 7 dias depois do primeiro pagamento de um plano, devolvemos o valor pago. Peça {contactLine()}.</li>
        <li>Pagamento em atraso: o acesso continua por até 5 dias; depois, buscas, criação de sites e envios ficam bloqueados até a regularização. Seus dados são mantidos.</li>
      </ul>

      <h2>3. Uso do WhatsApp</h2>
      <ul>
        <li>A conexão com o WhatsApp é feita por uma integração não oficial (Evolution API). O WhatsApp pode restringir ou bloquear números que enviam mensagens em volume, e o Vendlia não controla nem garante essa decisão.</li>
        <li>Você se compromete a usar um número comercial, respeitar os limites de envio configurados, abordar apenas empresas com contato comercial público e atender imediatamente a quem pedir para não receber mais mensagens.</li>
        <li>É proibido usar a plataforma para spam, golpes, conteúdo enganoso, ofensivo ou ilegal, ou para contatar pessoas físicas sem base legal.</li>
      </ul>

      <h2>4. Dados das empresas e conteúdo gerado</h2>
      <ul>
        <li>Os dados das empresas vêm de fontes públicas (Google Maps, OpenStreetMap) ou de listas que você importa, e você é responsável pela origem das listas importadas.</li>
        <li>Textos, imagens e logos são gerados por inteligência artificial e podem conter erros. Revise tudo com o cliente antes de publicar; os pontos a confirmar aparecem marcados no Studio.</li>
        <li>Fotos vindas do Google Maps têm autores próprios: confirme com o dono do negócio antes de usá-las no site oficial.</li>
        <li>Os sites e logos que você cria pela plataforma podem ser usados comercialmente por você e por seus clientes.</li>
      </ul>

      <h2>5. Disponibilidade e limitações</h2>
      <ul>
        <li>Trabalhamos para manter a plataforma no ar, mas ela pode ficar indisponível por manutenção ou falhas de serviços de terceiros (WhatsApp, Google, provedores de IA e hospedagem).</li>
        <li>O Vendlia não garante resultados de vendas, respostas ou faturamento.</li>
        <li>Nossa responsabilidade, quando existir, fica limitada ao valor pago por você nos 3 meses anteriores ao fato.</li>
      </ul>

      <h2>6. Suspensão e encerramento</h2>
      <p>Podemos suspender contas que violem estes termos, especialmente em caso de spam, denúncias ou uso ilegal. Você pode encerrar sua conta quando quiser {contactLine()}; os dados são apagados conforme a Política de privacidade.</p>

      <h2>7. Alterações e foro</h2>
      <p>Podemos atualizar estes termos e avisaremos com antecedência mudanças relevantes. Aplica-se a lei brasileira, inclusive o Código de Defesa do Consumidor quando cabível, e fica eleito o foro do domicílio do consumidor.</p>
    </LegalPage>
  );
}
